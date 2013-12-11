var express = require('express');
var redis = require('redis');
var uuid = require('uuid');
var crypto = require('crypto');

function sha1hex(item){
  return crypto.createHash('sha1').update(item).digest('hex');
}

// The regular expresion for UUID paths
var hexClass = "[0-9a-fA-F]";
var uuidRouteRegex = new RegExp("^\\/("
  + hexClass + "{8}-" + hexClass + "{4}-"
  + hexClass + "{4}-" + hexClass + "{4}-"
  + hexClass + "{12})(?:\\/(\\d+))?$");

module.exports = function(cfg) {
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

    // Note that this will clobber any existing subscription on this channel.
    // For our purposes, this is okay (if another request comes in for the same
    // UUID and ganks the subscription, that's weird but fine), but in another
    // circumstance you would probably want a more robust solution.
    subscribe = function subscribe(channel, listener, cb) {
      subscriptionCbs[channel] = listener;
      dbSubscriber.subscribe(channel,cb);
    };

    // Note that this will remove ANY existing subscription on this channel.
    // If another request has made a subsequent subscription to this channel,
    // this unsubscribe will remove it. Once again, for our purposes, this is
    // okay (if another request comes in for the same UUID and gets
    // unsubscribed by the first one timing out, that's the edge case coming
    // back to bite you), but in another circumstance you would probably want a
    // more robust solution.
    unsubscribe = function unsubscribe(channel, cb) {
      dbSubscriber.unsubscribe(channel,function(err){
        delete subscriptionCbs[channel];
        return cb(err);
      });
    };

    dbSubscriber.on("message",function(channel,message){
      if(subscriptionCbs[channel]) { //This should always be true, but be safe
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
    db.lindex('get/path/' + path, 0, function(err, offer){
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
        // "to" is set to itself as a sort of semaphore that this is a
        // waiting offer that posts messages to its "from" field
        .set('post/id/' + privateId + '/to', privateId, 'PX', itemTTL)
        // "from" is set to the path to add new messages while waiting
        // (intentionally semi-redundant to "put")
        .set('post/id/' + privateId + '/from', path, 'PX', itemTTL)

        // Set location for responses
        .set('location/path/' + path, respondToId, 'PX', itemTTL)

        // Set path and UUID for TTL refresh on get
        .set('get/id/' + privateId + '/offer/path', path, 'PX', itemTTL)
        .set('get/id/' + privateId + '/offer/id', respondToId, 'PX', itemTTL)

        // Set targets for response to modify
        .set('post/id/' + respondToId + '/to', privateId, 'PX', itemTTL)
        .set('post/id/' + respondToId + '/from', path, 'PX', itemTTL)

        // Set initial value
        .rpush('get/path/' + path, req.body)
        .pexpire('get/path/' + path, itemTTL)

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
    .lindex('get/path/' + path, 0)

    // Get the UUID for answers to answer on, if there is an offer
    .get('location/path/' + path)

    // Don't refresh the TTL for either one- the other end refreshes them on
    // request, and if the other end stops requesting them, they should expire

    .exec(function(err, results){
      if (err) return next(err);

      // If there is an offer at this path
      if (results[0]) {
        // Reply with the offer and the location to respond to
        // NOTE: The use of urlPrefix here is based on the assumption that
        // the underlying offeranswer subapp is use()d before the routes
        // that handle offerGet / offerPost, so the subapp's middleware will
        // set urlPrefix, and it won't get clobbered between there and here.
        // If using offeranswer outside of caress, this should be reviewed.
        return res.header('Location', req.urlPrefix + '/' + results[1])
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
  // (deprecated in favor of update message POSTs)
  app.put(uuidRouteRegex, function putUuid(req,res,next) {
    var pathUuid = req.params[0];

    // The index of the message to update. Update 0 (the initial / root update)
    // if not specified.
    var upIndex = req.params[1] || 0;

    // Get the key for this UUID to update
    db.get('put/id/' + pathUuid, function(err,putTo) {
      if (err) return next(err);

      // If this UUID is present for handling PUTs
      if (putTo) {
        db.multi()

        // Note that this can fail (with an error) if the target of the
        // PUT has expired. The alternatives would be doing a GET check for
        // existence first (meh), putting a WATCH in the transaction (bleh),
        // and/or doing the transaction as a script (eh, not now).
        // As a fix I'm probably just going to rip PUTs out entirely since
        // they're no longer part of the usage flow and are, in fact,
        // undesirable in the new paradigm.
        .lset(putTo, upIndex, req.body)

        // Don't re-expire the messages as that is the getter's job

        // publish the update to anybody currently asking
        .publish(putTo, req.body)

        .exec(function(err, results) {
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

  // UUID POST handler, for answers and messages
  app.post(uuidRouteRegex, function postUuid(req,res,next) {
    var pathUuid = req.params[0];

    // Ignore any subindex. POSTing to a subpath should really be an error but

    db.multi()

    // Get the UUID that the offerer is updating / listening on, or the UUID
    // that the other end is at if it's connected
    .get('post/id/' + pathUuid + '/to')

    // Get the path that the offer is at
    .get('post/id/' + pathUuid + '/from')

    .exec(function(err,results) {
      if (err) return next(err);

      function respondOk(err) {
        if (err) return next(err);

        // Respond that the post was received successfully
        res.send(200);
      }

      // If there is an offer listening for POSTs on this UUID
      if (results[0]) {

        // Note that, since there's no "push only if exists" param for rpush,
        // rpushes in here can all push to a list that has been expired since
        // we got the paths, and as such, *in theory*, create a new list.
        // This is mostly harmless (the worst that could happen is we get some
        // messages that don't expire unless somebody who stopped reading reads
        // them again, in which case they'll just be garbage that causes an
        // error to a client that was doing unspecified behavior in the first
        // place) and unlikely (in normal operation, if a request is going to
        // come in, it's going to be significantly before the timeout
        // threshold), but is still something to keep in mind for future
        // improvement (EVAL-based transactions should close this gap).

        // Technically such an event could be post-facto detected (reversing
        // any rpush that resulted in a length of 1), but I honestly don't
        // feel it's warranted, for the reasons enumerated above (I'll probably
        // just do the transaction as a script before then).

        // if this is a waiting offer's path to update itself
        if (results[0] == pathUuid) {
          // If we have the path we're waiting on (which we will unless
          // something has briefly and unexpectly failed)
          if (results[1]) {
            // Add the new message
            // We respond immediately after adding because we don't need to
            // publish if we're POSTing messages from an unanswered offer, as
            // its unanswered state means nobody will be listening
            db.rpush('get/path/' + results[1], req.body, respondOk);

          // If we're pointing to ourselves but have no path to update
          } else {
            // Hypothetical timing glitch that can't really happen due to
            // transactions.
            res.send(500, 'Try Again');
          }

        // If this is an endpoint that posts to a symmetric endpoint, not an
        // unanswered offer (which would have a "from" field)
        } else if (!results[1]) {
          // Add the new message
          db.rpush('get/id/' + results[0], req.body,
            // Once it's been added, announce it
            // (can't be simultaneous because we need the index we added to)
            function publishNew(err, length) {
              if(err) return next(err);
              db.publish('get/id/' + results[0] + '/' + (length-1), req.body,
                respondOk);
            });

        // If this is the UUID for an Answer (it has a "from" field)
        } else {
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
          // We delete the "from" before we change the "to" so, worst case
          // scenario, we know this was being rewired if only the first goes
          // through
          .del('post/id/' + results[0] + '/from')
          .set('post/id/' + results[0] + '/to', privateId)

          // Delete the offer connections used for heartbeats on GET
          .del('get/id/' + results[0] + '/offer/path')
          .del('get/id/' + results[0] + '/offer/id')

          // Delete the data leading to this POST route
          .del('location/path/' + results[1])
          .del('post/id/' + pathUuid + '/to')
          .del('post/id/' + pathUuid + '/from')

          // Set the put and post handlers for this answer
          .set('put/id/' + privateId, 'get/id/' + results[0], 'PX', itemTTL)
          .set('post/id/' + privateId + '/to', results[0], 'PX', itemTTL)

          // Create the message list
          .rpush('get/id/' + results[0], req.body)
          .pexpire('get/id/' + results[0], itemTTL)

          // publish the update to anybody currently asking
          .publish('get/id/' + results[0] + '/0', req.body)

          .exec(function(err) {
            if (err) return next(err);

            // Respond that the post was received successfully
            res.header('Location', req.urlPrefix + '/' + privateId)
              .send(201);
          });
        }
      } else {
        //If no post handler here, send a 404 Not Found response
        res.send(404);
      }
    });
  });

  // UUID GET handler, for listening for updates to an offer/answer
  app.get(uuidRouteRegex, function getUuid(req, res, topnext) {
    var pathUuid = req.params[0];

    // The index of the message to get / await. Listen for 0 (the initial /
    // root message) if not specified.
    var getIndex = req.params[1] || 0;

    // The Etag of the body as it currently exists on the client
    var theirEtag = req.headers["if-none-match"];

    // The Etag of the body as it currently exists on the server
    // (will be set in the database callback)
    var ourEtag;

    // Timeout ID for responses (will be set if we go into long polling)
    var timer;

    // Clean up timer / subscription, then call the callback (respond).
    function finish(cb) {
      clearTimeout(timer);
      return unsubscribe('get/id/' + pathUuid, cb);
    }

    // Override the next() error/passthrough handler to clean up before
    // leaving. This way, the timer doesn't go off / the subscriber doesn't
    // handle messages after we've sent the response, and the server doesn't
    // crash as a result.
    function next(err) {
      return finish(function (finishErr) {
        if (err) return topnext(err);
        else if (finishErr) return topnext(finishErr);
        else return topnext();
      });
    }

    // Callback for if there's no new body by the time we're supposed to
    // respond.
    function noNew() {
      return finish(function(err) {
        if (err) return next(err);

        // If there was a body initially, respond that there's been no change
        if (ourEtag) return res.send(304);

        // Otherwise, respond that there's no content (yet)
        else return res.send(204);
      });
    }

    // Callback for when we get a mesage that there's a new body.
    function getNew(body) {

      // If the new body is present (say, if it wasn't deleted)
      if (body) {
        // Calculate the new Etag
        ourEtag = '"' + sha1hex(body) + '"';

        // If it's a new body (which it almost certainly should be)
        if (ourEtag != theirEtag) {
          return finish(function (err) {
            if(err) return next(err);

            // Set the Etag header and send it
            return res.header('Etag',ourEtag).send(body);
          });
        }
        // If it's not a new body we do nothing and keep listening / waiting

      // If the new body is empty
      } else {
        return finish(function (err) {
          if(err) return next(err);

          // Respond that it is now Not Found
          return res.send(404);
        });
      }
    }

    function awaitNew() {

      // Subscribe to updates to the content we're listening to from the
      // other end
      subscribe('get/id/' + pathUuid + '/' + getIndex, getNew);

      // Set a timer to respond if there's no new content over the duration
      // of the poll
      timer = setTimeout(noNew, pollWait);
    }

    db.multi()

    // Get any content for this path.
    .lindex('get/id/' + pathUuid, getIndex)

    // Get if there's content for ANY path under this ID.
    .exists('get/id/' + pathUuid)

    // Get the target of PUT requests updating through this path
    // (for TTL refresh).
    .get('put/id/' + pathUuid)

    // Get the path to update if we're waiting for an answer,
    // so we know if emptiness is expected and what location to update.
    .get('get/id/' + pathUuid + '/offer/path')

    // Get the UUID to update if we're waiting for an answer, so we don't have
    // to get the path specified in the previous field.
    .get('get/id/' + pathUuid + '/offer/id')

    // Get the TTL in milliseconds of the other end's content (if present).
    // Not currently used, but could be used to have quicker response when
    // the other end drops out.
    .pttl('get/id/' + pathUuid)

    // Refresh the TTL on the fields associated with this ID.
    .pexpire('put/id/' + pathUuid, itemTTL)
    .pexpire('post/id/' + pathUuid + '/to', itemTTL)
    .pexpire('post/id/' + pathUuid + '/from', itemTTL)
    .pexpire('get/id/' + pathUuid + '/offer/path', itemTTL)
    .pexpire('get/id/' + pathUuid + '/offer/id', itemTTL)

    // We do NOT refresh the TTL of the other end's messages to us
    // ('get/id/' + pathUuid), as that is the job of the other end's
    // updates and listening GET polls.

    .exec(function (err,results) {
      if (err) return next(err);

      var body = results[0];
      var exists = results[1];
      var target = results[2];
      var waiting = results[3];
      var locUuid = results[4];

      // If there's content for this route, or we're waiting for content
      if (exists || waiting) {

        // If there's content, calculate the etag for it
        if (body) ourEtag = '"' + sha1hex(body) + '"';

        var transaction = db.multi();

        // Refresh the TTL on our target
        transaction.pexpire(target, itemTTL);

        // Refresh the receiver path's fields' TTLs if we're waiting, too
        if (waiting) {
          transaction.pexpire('location/path/' + waiting, itemTTL);
          transaction.pexpire('post/id/' + locUuid + '/from', itemTTL);
          transaction.pexpire('post/id/' + locUuid + '/to', itemTTL);
        }

        transaction.exec(function(err) {
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
