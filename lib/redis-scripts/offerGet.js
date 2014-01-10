module.exports = ["local c=redis.call",
  //ARGV[1]: name
  // Return any offer at this name and the reply location
  "return {c('lindex','offer-list/'..ARGV[1],0),",
    "c('get','offer-reply-location/'..ARGV[1])}"
  // Don't refresh the TTL for either one- the offerer refreshes them when
  // checking for answers, and if the other end stops checking, they should
  // expire
  ].join('\n');
