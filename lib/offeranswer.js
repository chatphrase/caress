var express = require('express');
var redis = require('redis');
var uuid = require('uuid');

var hexClass = "[0-9a-fA-F]";
var uuidRouteRegex = new RegExp("^\\/("
  + hexClass + "{8}-" + hexClass + "{4}-"
  + hexClass + "{4}-" + hexClass + "{4}-"
  + hexClass + "{12})$");

//TODO: change all set calls to setex

module.exports = function(cfg){
  var app = express();
  
  var db = redis.createClient(cfg.redis.port, cfg.redis.hostname,
    {no_ready_check: true});
  db.auth(cfg.redis.password);
  var dbSubscriber = redis.createClient(cfg.redis.port, cfg.redis.hostname,
    {no_ready_check: true});
  dbSubscriber.auth(cfg.redis.password);

  var subscriptionCbs = Object.create(null);
  
  function subscribe(channel, listener, cb) {
    subscriptionCbs[channel] = listener;
    dbSubscriber.subscribe(channel,cb);
  }
  
  function unsubscribe(channel, cb) {
    dbSubscriber.unsubscribe(channel,cb);
    delete subscriptionCbs[channel];
  }
  
  dbSubscriber.on("message",function(channel,message){
    if(subscriptionCbs[channel]) { //if not, I don't know, some problem
      subscriptionCbs[channel](message);
    }
  });
  
  // Middleware to handle rewriting responses.
  app.use(function(req,res,next){
    req.urlPrefix = req.originalUrl.slice(0,-req.url.length);
    next();
  });
  
  //storeOfferFor: some key that is prefixed with something other than get/,
  // put/, or answer/
  app.createOfferTo = function createOfferTo(storeOfferFor,cb) {
    //create UUID
    var offerToUuid = uuid.v4();
    //set 'put/' + UUID to 'store-offer ' + storeOfferAt
    db.set('put/' + offerToUuid, 'store-offer ' + storeOfferFor, function(err){
      return cb(err,offerToUuid);
    //caller should respond with 'Offer-To' header, consisting of the path to
    //the signaling app/server + offerToUuid
    });
  };
  
  app.getOfferAt = function getOfferAt(findOfferFor,cb) {
    db.get(findOfferFor,function(err,offer){
      if (offer) {
        // note that this could be refactored so that every request for an
        // Offer generates a new UUID to read from, so that other potential
        // Answerers can have their read rights revoked once the first definite
        // answer comes in. But that seems like a complication that would be a
        // touch unnecessary.
        
        // Note that answerTo is generated when offerAt is gotten, rather than
        // being generated here.
      } else {
        return cb(err,null);
      }
    });
  };
  
  app.put(uuidRouteRegex, function putUuid(req,res,next) {
    var pathUuid = req.params[0];

    db.get('put/' + pathUuid, function(err,content) {
      if (content) {
        var putParams = content.split(' ',2);
        if (putParams[0] == 'store-offer') {

          //TODO: Ensure we're not clobbering an existing offer
          //(in the event someone else won the race)
          
          //If the corresponding offer disappears after creating this answer,
          //that will be corrected on the next read

          var answerAtUuid = uuid.v4();
          //See note in getOfferAt about how this could be deferred.
          var offerAtUuid = uuid.v4();
          
          db.multi()
          
            // Store the location for answers to read this offer
            .set(putParams[1],offerAtUuid)
            
            // Put this offer there
            .set('get/' + offerAtUuid, req.body)
            
            // change state to update that offer
            .set('put/' + pathUuid,'update ' + offerAtUuid)
            
            // Set an empty document at Answer-At, so the get route knows to
            // send a No Content after timeout
            .set('get/' + answerAtUuid,'')
            
            // Store the location for any answers to this offer to
            // store their answer at
            .set('answer/' + offerAtUuid, answerAtUuid)
            
            // We don't set 'get/' + pathUuid because pathUuid is an Offer-To
            // UUID, and Offer-To and Answer-To are put-only

            // publish the update to anybody currently asking
            .publish('update/' + offerAtUuid, req.body)
            
            .exec(function(err) {
              if (err) return next(err);
              
              // Respond to the request with headers telling the offerer where
              // to look for an answer, and (for completion's sake) where their
              // offer was published
              res.set('Location',
                req.urlPrefix + '/' + offerAtUuid)
              .set('Chatphrase-Answer-At',
                req.urlPrefix + '/' + answerAtUuid)
              .send(201);
            });
          
        } else if (putParams[0] == 'answer-offer') {
          //TODO: Ensure we're not clobbering an existing answer
          //(in the event someone else won the race)
          
          // TODO: Should I have answer/ work this way, and not the other way
          // around (create answer UUID, put UUID to get at answer/, requestor
          // polls offerTo location to await answerAt header)?
          
          // That was the original way I wrote it, and it does obliviate the
          // need for a few pieces of data and a few extra steps, even though
          // it makes the REST semantics a little messier (instead of both
          // sides polling *At, both sides are polling Offer*, and headers are
          // less useful)
          
          // Perhaps a nomenclature change is in order.
          
          db.multi()
            // Set the answer at Answer-At
            .set('get/' + putParams[1], req.body)
            // change state to update that answer
            .set('put/' + pathUuid,'update ' + putParams[1])
            
            // We don't set 'get/' + pathUuid because pathUuid is an Answer-To
            // UUID, and Offer-To and Answer-To are put-only

            // publish the update to anybody currently asking
            .publish('update/' + putParams[1], req.body)
            
            .exec(function(err) {
              if (err) return next(err);
              
              // Respond to the request with headers (for completion's sake)
              // telling the offerer where their offer was published
              res.set('Location',
                req.urlPrefix + '/' + putParams[1])
              .send(201);
            });

        } else if (putParams[0] == 'update') {

          db.multi()
            // refresh TTL
            .expire('put/' + pathUuid, cfg.expireTtl)
            .expire('get/' + putParams[1], cfg.expireTtl)
            
            // Update the offer
            .set('get/' + putParams[1], req.body)
            
            // publish the update to anybody currently asking
            .publish('update/' + putParams[1], req.body)
            
            .exec(function(err) {
              if (err) return next(err);
              
              // Respond to the request (for completion's sake) with
              // where their update was published
              // TODO: Respond to the request with headers telling the offerer
              // where to look for an answer, when relevant
              res.set('Location',
                req.urlPrefix + '/' + putParams[1]).send(200);
            });

        } else {
          next(new Error('unexpected put handler: '+content));
        }
      } else {
        //If no put handler here, send a 404 Not Found response
        res.status(404).send();
      }
    });
  });
  
  app.get(uuidRouteRegex, function getUuid(req, res, next) {
    var pathUuid = req.params[0];

    // this is a bit of a hack because I'm in a hurry
    var hash;
    
    function handleResponseFromEtag(err) {
      function respond(newbody){
        unsubscribe('update/' + pathUuid, function(err){
          if (err) return next(err);

          res.send(newbody);
        });
      }
      
      if (err) return next(err);
      else {
        if(hash && req.headers['etag'] == hash) {
          subscribe('update/' + pathUuid, respond(function(body){
            res.send(body);
          }),function(err){
            if (err) return next(err);
            setTimeout(function(){
              unsubscribe('update/' + pathUuid, function(err){
                if (err) return next(err);
                
                res.send(304);
              });
            },cfg.requestTtl);
          });
        }
      }
    }

    db.multi()
      //get any content at this UUID
      .get('put/' + pathUuid) 
      //get any potential Answer-At for this UUID
      .get('answer/' + pathUuid)
      .exec(function(err,content) {
        if (content[0]) {
          //calculate SHA hash (if there's a body)
          //TODO: calculate
          hash = content[0];
          if (content[1]) {
            var answerToUuid = uuid.v4();

            // NOTE: Come to think of it, this really should be refactored to
            // have the answerer read from their answerTo UUID...

            db.set('put/' + answerToUuid, 'answer-offer ' + content[1],
              handleResponseFromEtag);
          } else {
            handleResponseFromEtag();
          }
      } else if (content === '') {
        handleResponseFromEtag();
      } else {
        //If no content handler here, send a 404 Not Found response
        res.status(404).send();
      }
    });
  });
};