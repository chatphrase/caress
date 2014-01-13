module.exports = ["local c=redis.call",
  //ARGV[1]: uuid
  //ARGV[2]: index
  "local t=ARGV[3]", //ttl
  "local p='pexpire'",
  // Get the UUID of our match if we're a matched connection
  "local m=c('get','match/'..ARGV[1])",
  // Get the name of our offer if we're an unanswered offer
  "local n=c('get','offer-name/'..ARGV[1])",
  // Get the name of our start if we're an unanswered start
  "local s=c('get','start-name/'..ARGV[1])",
  // Refresh TTLs on our related indices
  "if m then",
    "c(p,'match/'..ARGV[1],t)",
    "c(p,'message-list/'..m,t)",
    // If we're matched to a start we've yet to message, refresh that flag
    "c(p,'start-listless/'..m,t)",
  "elseif n then",
    "c(p,'offer-name/'..ARGV[1],t)",
    // The key for the answer handler UUID for an unanswered offer
    "local r='offer-reply-location/'..n",
    "c(p,'offer-list/'..n,t)",
    "c(p,r,t)",
    "c(p,'offer-answer/'..c('get',r),t)",
  "elseif s then",
    "c(p,'start-name/'..ARGV[1],t)",
    "c(p,'start/'..s,t)",
  "end",
  // Get the TTL of the message-list
  "local l=c('pttl','message-list/'..ARGV[1])",
  // For starts that haven't received messages, fall back
  "if l<0 then l=c('pttl','start-listless/'..ARGV[1]) end",
  // Return info for message or waiting
  "return {",
    "c('lindex','message-list/'..ARGV[1],ARGV[2]),",
    "l,(n or s) and 1 or 0}"
  ].join('\n');
