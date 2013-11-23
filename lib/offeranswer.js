var express = require('express');
var redis = require('redis');
var uuid = require('uuid');
var crypto = require('crypto');

function sha1hex(item){
  return crypto.createHash('sha1').update(name).digest('hex');
}

// The regular expresion for UUID paths
var hexClass = "[0-9a-fA-F]";
var uuidRouteRegex = new RegExp("^\\/("
  + hexClass + "{8}-" + hexClass + "{4}-"
  + hexClass + "{4}-" + hexClass + "{4}-"
  + hexClass + "{12})$");

module.exports = function(cfg){
  cfg = cfg || {};

  // The duration to wait before responding to a poll.
  var pollWait = cfg.pollWait || 10000;
  // The duration to wait for a re-request after responding to a poll.
  var afterWait = cfg.afterWait || 10000;
  // The TTL of an item that is intended to be polled on.
  var itemTTL = pollWait + afterWait;

  var app = express();

  // Set up interface for Redis and channel-based pub/sub callbacks
  var db, subscribe, unsubscribe; (function setupRedis(){

    db = redis.createClient(cfg.redis.port, cfg.redis.hostname,
      {no_ready_check: true});
    if (cfg.redis.password) db.auth(cfg.redis.password);
    var dbSubscriber = redis.createClient(cfg.redis.port, cfg.redis.hostname,
      {no_ready_check: true});
    if (cfg.redis.password) dbSubscriber.auth(cfg.redis.password);

    var subscriptionCbs = Object.create(null);

    subscribe = function subscribe(channel, listener, cb) {
      subscriptionCbs[channel] = listener;
      dbSubscriber.subscribe(channel,cb);
    };

    unsubscribe = function unsubscribe(channel, cb) {
      dbSubscriber.unsubscribe(channel,cb);
      delete subscriptionCbs[channel];
    };

    dbSubscriber.on("message",function(channel,message){
      if(subscriptionCbs[channel]) { //if not, I don't know, some problem
        subscriptionCbs[channel](message);
      }
    });
  })();

  // Middleware to handle rewriting responses.
  app.use(function(req,res,next){
    req.urlPrefix = req.originalUrl.slice(0,-req.url.length);
    next();
  });

  // Middleware to handle text bodies.
  function parseTextBody(req, res, next){
    if (req.is('text/*') && req.body === undefined) {
      req.body = '';
      req.setEncoding('utf8');
      req.on('data', function(chunk){ req.body += chunk });
      req.on('end', next);
    } else {
      next();
    }
  }

  app.use(parseTextBody);

  // Function for outer app to use to handle offer POST requests
  function offerPost(path, req, res, next) {

    // Check if there's already an offer on this path
    db.get('get/path/' + path, function(err, offer){
      if (err) return next(err);

      // If there's already an offer on this path
      if (offer) {

        // Send a 303 See Other to direct the client to GET the content that is
        // already present on this path, along with the body of that offer.
        // (Debated using a 409 Conflict here, but decided against it)
        return res.header('Location', req.originalUrl).send(303, offer);

        // NOTE: It arguably shouldn't have a content body when sending this
        // response, or it should include the location to respond to, or
        // something, I don't know. This could maybe be made cooler.

      // If this path is empty
      } else {

        // create the UUID for this offerer to update / listen at
        var privateId = uuid.v4();

        // Create the UUID for answers to post to
        var respondToId = uuid.v4();

        db.multi()

        // Set target for updates
        .set('put/id/' + privateId, 'get/path/' + path, 'PX', itemTTL)

        // Set offer path for TTL refresh on get
        .set('get/id/' + privateId + '/offerat', 'get/path/' + path,
          'PX', itemTTL)

        // Set location for responses
        .set('location/path' + path, respondToId, 'PX', itemTTL)

        // Set targets for response to modify
        .set('post/id/' + respondToId + '/to', privateId, 'PX', itemTTL)
        .set('post/id/' + respondToId + '/from', path, 'PX', itemTTL)

        // Set initial value
        .set('get/path/' + path, res.body, 'PX', itemTTL)

        .exec(function(err){
          if (err) return next(err);
          // Respond with Created status and location for updates /
          // polling for a response
          return res.header('Location', req.urlPrefix + '/' + privateId)
            .send(201);
        });
      }
    });
  }

  // Function for outer app to use to handle offer GET requests
  function offerGet(path,req,res,next){

    db.multi()

    // Get the offer at this path, if there is one
    .get('get/path/' + path)

    // Get the UUID for answers to answer on, if there is an offer
    .get('location/path/' + path)

    // Refresh the TTL for both of these, if they exist
    .pexpire('get/path/' + path, itemTTL)
    .pexpire('location/path/' + path, itemTTL)

    .exec(function(err, results){
      if (err) return next(err);

      // If there is an offer at this path
      if (results[0]) {
        // Reply with the offer and the location to respond to
        return res.header('Location',req.urlPrefix + '/' + results[1])
          .send(200,results[0]);

      // Otherwise, send a 404
      } else {
        return res.send(404);
      }
    });
  }

  // Export wrapped versions

  app.offerPost = function appOfferPost(path, req, res, next){
    return parseTextBody(req, res, function(){
      offerPost(path, req, res, next);
    });
  };

  app.offerGet = function appOfferGet(path, req, res, next){
    return parseTextBody(req, res, function(){
      offerGet(path, req, res, next);
    });
  };

  // UUID PUT handler, for offer/answer updates
  app.put(uuidRouteRegex, function putUuid(req,res,next) {
    var pathUuid = req.params[0];

    // Get the key for this UUID to update
    db.get('put/id/' + pathUuid, function(err,putTo) {
      if (err) return next(err);

      // If this UUID is present for handling PUTs
      if (putTo) {
        db.multi()

        // Put this body at the specified key
        // Only set if exists (requires Redis ~2.6.12).
        // That way, if the other end hasn't requested the signal recently
        // enough that the asset has expired, the put will fail as the
        // other side has disconnected.
        // Hooray for mutually symmetric heartbeats!
        // (Since waiting offers refresh on their own GETs for answers, this
        // shouldn't affect the asymmetric case.)
        .set(putTo, req.body, 'XX', 'PX', itemTTL)

        // publish the update to anybody currently asking
        .publish(putTo, req.body)

        .exec(function(err,results) {
          if (err) return next(err);

          // If the target was updated,
          // respond that the put was completed successfully
          if (results[0]) return res.send(200);
          // Otherwise, return that we couldn't
          else return res.send(404);
        });

      } else {
        //If no put handler here, send a 404 Not Found response
        res.send(404);
      }
    });
  });

  // UUID POST handler, for answers
  app.post(uuidRouteRegex, function postUuid(req,res,next) {
    var pathUuid = req.params[0];

    db.multi()

    // Get the UUID that the offerer is updating / listening on
    .get('post/id/' + pathUuid + '/to')

    // Get the path that the offer is at
    .get('post/id/' + pathUuid + '/from')

    .exec(function(err,results) {
      if (err) return next(err);

      // If there is indeed an offer listening for POSTs on this UUID
      if (results[0]) {

        // Create a new UUID for this answerer to update / listen on
        var privateId = uuid.v4();

        // TODO: WATCH on this transaction?
        // Alternately, this transaction could really be converted to a
        // Lua script EVAL
        db.multi()

        // Rewire offer updates to go to this answerer
        .rename('get/path/' + results[1], 'get/id/' + privateId)
        .pexpire('get/id/' + privateId, itemTTL)
        .set('put/id/' + results[0], 'get/id/' + privateId, 'PX', itemTTL)

        // Delete the offer connection used for heartbeats on GET
        .del('get/id/' + results[0] + '/offerat')

        // Delete the data leading to this POST route
        .del('location/path/' + results[1])
        .del('post/id/' + pathUuid + '/to')
        .del('post/id/' + pathUuid + '/from')

        // Set the put update handler for this answer
        .set('put/id/' + privateId, 'get/id/' + results[0], 'PX', itemTTL)

        // Put this body where it will be read
        .set('get/id/' + results[0], req.body, 'PX', itemTTL)

        // publish the update to anybody currently asking
        .publish('get/id/' + results[0], req.body)

        .exec(function(err) {
          if (err) return next(err);

          // Respond that the post was received successfully
          res.send(200);
        });

      } else {
        //If no post handler here, send a 404 Not Found response
        res.send(404);
      }
    });
  });

  // UUID GET handler, for listening for updates to an offer/answer
  app.get(uuidRouteRegex, function getUuid(req, res, next) {
    var pathUuid = req.params[0];

    // The Etag of the body as it currently exists on the client
    var theirEtag = req.headers["if-none-match"];

    // The Etag of the body as it currently exists on the server
    // (will be set in the database callback)
    var ourEtag;

    // Timeout ID for responses (will be set if we go into long polling)
    var timer;

    // Clean up timer / subscription, then call the callback (respond).
    function finish(cb){
      clearTimeout(timer);
      return unsubscribe('get/id/' + pathUuid, cb);
    }

    // Callback for if there's no new body by the time we're supposed to
    // respond.
    function noNew(){
      return finish(function(err) {
        if (err) return next(err);

        // If there was a body initially, respond that there's been no change
        if (ourEtag) return res.send(304);

        // Otherwise, respond that there's no content (yet)
        else return res.send(204);
      });
    }

    // Callback for when we get a mesage that there's a new body.
    function getNew(err, body) {
      if (err) return next(err);

      // If the new body is present (say, if it wasn't deleted)
      if (body) {
        // Calculate the new Etag
        ourEtag = '"' + sha1hex(body) + '"';

        // If it's a new body (which it almost certainly should be)
        if (ourEtag != theirEtag) {
          return finish(function(err) {
            if(err) return next(err);

            // Set the Etag header and send it
            return res.header('Etag',ourEtag).send(body);
          });
        }
        // If it's not a new body we do nothing and keep listening / waiting

      // If the new body is empty
      } else {
        return finish(function(err) {
          if(err) return next(err);

          // Respond that it is now Not Found
          return res.send(404);
        });
      }
    }

    function awaitNew() {

      // Subscribe to updates to the content we're listening to from the
      // other end
      subscribe('get/id/' + pathUuid, getNew);

      // Set a timer to respond if there's no new content over the duration
      // of the poll
      timer = setTimeout(noNew, pollWait);
    }

    db.multi()

    // Get any content for this path.
    .get('get/id/' + pathUuid)

    // Get the target of PUT requests updating through this path.
    .get('put/id/' + pathUuid)

    // Get the flag that states that we're an offer listening for an answer,
    // so we know if emptiness is expected.
    .get('get/id/' + pathUuid + '/offerat')

    // Get the TTL in milliseconds of the other end's content (if present).
    // Not currently used, but could be used to have quicker response when
    // the other end drops out.
    .pttl('get/id/' + pathUuid)

    // Refresh the TTL on the PUT target, if present.
    .pexpire('put/id/' + pathUuid, itemTTL)

    // Refresh the TTL on the offer flag, if present.
    // If not present, this won't do anything.
    .pexpire('get/id/' + pathUuid + '/offerat', itemTTL)

    // We do NOT refresh the TTL of the other end's messages to us
    // ('get/id/' + pathUuid), as that is the job of the other end's
    // updates and listening GET polls.

    .exec(function (err,results) {
      if (err) return next(err);

      var body = results[0];
      var target = results[1];
      var waiting = results[2];

      // If there's content for this route, or we're waiting for content
      if (body || waiting) {

        // If there's content, calculate the etag for it
        if (body) ourEtag = '"' + sha1hex(body) + '"';

        // Refresh the TTL on our target
        return db.pexpire(target, itemTTL, function(err) {
          if (err) return next(err);

          // If we have content and it's not what the client already has
          if (body && ourEtag != theirEtag) {
            // Set the Etag header and send it
            return res.header('Etag', ourEtag).send(body);

          // If we don't have new content to offer
          } else {
            // Wait for it
            awaitNew();
          }
        });

      // If there's no content for this route
      } else {
        // Respond with Not Found status
        return res.send(404);
      }
    });
  });

  return app;
};
