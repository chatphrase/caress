module.exports = ["local c=redis.call",
  //ARGV[1]: uuid
  //ARGV[2]: index
  //ARGV[3]: body
  // Get the UUID of our match if we're a matched connection
  "local m=c('get','match/'..ARGV[1])",
  // Get the name of our offer if we're an unanswered offer
  "local n=c('get','offer-name/'..ARGV[1])",
  // If this UUID is present for handling PUTs
  "if m or n then",
    "local l",
    "if m then",
      "l=c('lset','message-list/'..m,ARGV[2],ARGV[3])",
      "if l.ok then c('publish','message/'..m..'/'..ARGV[2],ARGV[3]) end",
    "elseif n then",
      "l=c('lset','offer-list/'..n,ARGV[2],ARGV[3])",
    "else return 0 end",
  "return l.ok and 1 or 0"
  ].join('\n');
