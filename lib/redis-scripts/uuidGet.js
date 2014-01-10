module.exports = ["local c=redis.call",
  //ARGV[1]: uuid
  //ARGV[2]: index
  "local t=ARGV[3]", //ttl
  "local p='pexpire'",
  // Get the UUID of our match if we're a matched connection
  "local m=c('get','match/'..ARGV[1])",
  // Get the name of our offer if we're an unanswered offer
  "local n=c('get','offer-name/'..ARGV[1])",
  // Refresh TTLs on our related indices
  "if m then",
    "c(p,'message-list/'..m,t)",
  "elseif n then",
    // The key for the answer handler UUID for an unanswered offer
    "local l='offer-reply-location/'..n",
    "c(p,'offer-list/'..n,t)",
    "c(p,l,t)",
    "c(p,'offer-answer/'..c('get',l),t)",
  "end",
  // Return info for message or offer
  "return {",
    "c('lindex','message-list/'..ARGV[1],ARGV[2]),",
    "c('pttl','message-list/'..ARGV[1]),",
    "n and 1 or 0}"
  ].join('\n');
