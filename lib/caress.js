var express = require('express');
var redis = require('redis');

// The regular expresion for UUID paths
var hexClass = "[0-9a-fA-F]";
var uuidRoute = '/:path('+ hexClass + "{8}-" + hexClass + "{4}-"
  + hexClass + "{4}-" + hexClass + "{4}-"
  + hexClass + "{12})";
var uuidIndexRoute = uuidRoute + "/:index(\\d+)?";

module.exports = function(cfg){
  // The duration to wait before responding to a poll.
  var pollWait = cfg.pollWait || 10000;
  // The duration to wait for a re-request after responding to a poll.
  var afterWait = cfg.afterWait || 10000;
  // The TTL of an item that is intended to be polled on.
  var itemTTL = pollWait + afterWait;

  var app = express();

  // Set up interface for Redis and channel-based pub/sub callbacks
  var db = redis.createClient(cfg.redis.port, cfg.redis.hostname,
      {no_ready_check: true});
  if (cfg.redis.password) db.auth(cfg.redis.password);

  // Middleware to handle rewriting responses.
  app.use(function(req,res,next){
    req.urlPrefix = req.originalUrl.slice(0,-req.url.length);
    next();
  });

  // Middleware to handle text bodies.
  function parseTextBody(req, res, next){
    if (req.body === undefined) {
      req.body = '';
      req.on('data', function(chunk){ req.body += chunk });
      req.on('end', next);
    } else {
      next();
    }
  }

  app.use(parseTextBody);

  // Offer POST handler, for receiving initial offers
  app.post('/offers/:phrase', require('./routes/offerPost.js')(db, itemTTL));

  // Offer POST handler, for announcing initial offers
  app.get('/offers/:phrase', require('./routes/offerGet.js')(db));

  // Start POST handler, for connecting starts
  app.post('/start/:phrase', require('./routes/startPost.js')(db, itemTTL));

  // UUID PUT handler, for offer/answer updates
  // (deprecated in favor of update message POSTs)
  app.put(uuidIndexRoute, require('./routes/uuidPut.js')(db));

  // UUID POST handler, for answers and messages
  app.post(uuidRoute, require('./routes/uuidPost.js')(db, pollWait, itemTTL));

  // UUID GET handler, for listening for updates to an offer/answer
  app.get(uuidIndexRoute, require('./routes/uuidGet.js')(db,
    require('./subscriber.js')(cfg.redis), pollWait, itemTTL));

  return app;
};
