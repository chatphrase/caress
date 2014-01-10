module.exports = ["local c=redis.call",
  //ARGV[1]: uuid
  //ARGV[2]: body
  "local t=ARGV[3]", //ttl
  //ARGV[4]: Location UUID
  // Get the UUID of our match if we're a matched connection
  "local m=c('get','match/'..ARGV[1])",
  // Get the name of our offer if we're an unanswered offer
  "local n=c('get','offer-name/'..ARGV[1])",
  // Get the UUID of our offer if we're an offer answerer
  "local o=c('get','offer-answer/'..ARGV[1])",
  // The length of our list after rpushx, if pushing message
  "local l=0",
  // If we're a matched connection
  "if m then",
    // Post the message to our match's list
    "l=c('rpushx','message-list/'..m,ARGV[2])",
    // Publish the message for subscribed listeners on the other end
    "c('publish','message/'..m..'/'..(l-1),ARGV[2])",
    "return {l}",
  // If we're an unanswered offer
  "elseif n then",
    // Post the message to our future match's list
    "l=c('rpushx','offer-list/'..n,ARGV[2])",
    "return {l}",
  // If we're a reply location for answering offers
  "elseif o then",
    // Disconnect this offer answerer
    "c('del','offer-answer/'..ARGV[1])",
    // Rewire offer updates to go to the answerer
    "c('rename','offer-list/'..c('get','offer-name/'..o),",
      "'message-list/'..ARGV[4])",
    "c('pexpire','message-list/'..ARGV[4],t)",
    "c('psetex','match/'..o,t,ARGV[4])",
    // Delete offer record for this answerer
    "c('del','offer-reply-location/'..c('get','offer-name/'..o))",
    // Create the message list
    "l=c('rpush','message-list/'..o,ARGV[2])",
    "c('pexpire','message-list/'..o,t)",
    // Publish the new message for subscribed listeners from the offerer
    "c('publish','message/'..o..'/0',ARGV[2])",
    "return {l,ARGV[4]}",
  "else",
    "return {0}",
  "end",
  ].join('\n');
