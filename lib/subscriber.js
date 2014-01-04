var redis = require('redis');

module.exports = function(cfg) {
  var db = redis.createClient(cfg.port, cfg.hostname,
    {no_ready_check: true});
  if (cfg.password) db.auth(cfg.password);

  var subscriptionCbs = Object.create(null);

  db.on("message", function(channel, message){
    if(subscriptionCbs[channel]) { //This should always be true, but be safe
      subscriptionCbs[channel](message);
    }
  });
  return {
    db: db,
    // Note that this will clobber any existing subscription on this channel.
    // For our purposes, this is okay (if another request comes in for the same
    // UUID and ganks the subscription, that's weird but fine), but in another
    // circumstance you would probably want a more robust solution.
    subscribe: function subscribe(channel, listener, cb) {
      subscriptionCbs[channel] = listener;
      db.subscribe(channel,cb);
    },
    // Note that this will remove ANY existing subscription on this channel.
    // If another request has made a subsequent subscription to this channel,
    // this unsubscribe will remove it. Once again, for our purposes, this is
    // okay (if another request comes in for the same UUID and gets
    // unsubscribed by the first one timing out, that's the edge case coming
    // back to bite you), but in another circumstance you would probably want a
    // more robust solution.
    unsubscribe: function unsubscribe(channel, cb) {
      db.unsubscribe(channel,function(err){
        delete subscriptionCbs[channel];
        return cb(err);
      });
    }
  };
};
