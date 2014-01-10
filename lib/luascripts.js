module.exports = {
  offerPost: "local c=redis.call;" +
    //ARGV[1]: name
    //ARGV[2]: body
    "local t=ARGV[3];" + //ttl
    //ARGV[4]: Location UUID
    //ARGV[5]: Reply-Location UUID
    "local s='psetex';" +
    // Check if there's already an offer at this name
    "local o=c('lindex','offer-list/'..ARGV[1],0);" +
    // If there's an offer at this name, return it and the reply location
    "if o then return {o,c('get','offer-reply-location/'..ARGV[1])};" +
    // If the name is not currently occupied by an offer
    "else " +
      // Set location for responses
      "c(s,'offer-answer/'..ARGV[5],t,ARGV[4]);" +
      "c(s,'offer-reply-location/'..ARGV[1],t,ARGV[5]);" +
      // Set name and UUID for TTL refresh on get
      "c(s,'offer-name/'..ARGV[4],t,ARGV[1]);" +
      // Set initial offer value
      "c('rpush','offer-list/'..ARGV[1],ARGV[2]);" +
      "c('pexpire','offer-list/'..ARGV[1],t);" +
      "return {false};" +
    "end",

  offerGet: "local c=redis.call;" +
    //ARGV[1]: name
    // Return any offer at this name and the reply location
    "return {c('lindex','offer-list/'..ARGV[1],0)," +
      "c('get','offer-reply-location/'..ARGV[1])};",
    // Don't refresh the TTL for either one- the offerer refreshes them when
    // checking for answers, and if the other end stops checking, they should
    // expire

  uuidGet: "local c=redis.call;" +
    //ARGV[1]: uuid
    //ARGV[2]: index
    "local t=ARGV[3];" + //ttl
    "local p='pexpire';" +
    // Get the UUID of our match if we're a matched connection
    "local m=c('get','match/'..ARGV[1]);" +
    // Get the name of our offer if we're an unanswered offer
    "local n=c('get','offer-name/'..ARGV[1]);" +
    // Refresh TTLs on our related indices
    "if m then " +
      "c(p,'message-list/'..m,t);" +
    "elseif n then " +
      // The key for the answer handler UUID for an unanswered offer
      "local l='offer-reply-location/'..n;" +
      "c(p,'offer-list/'..n,t);" +
      "c(p,l,t);" +
      "c(p,'offer-answer/'..c('get',l),t);" +
    "end;" +
    // Return info for message or offer
    "return {" +
      "c('lindex','message-list/'..ARGV[1],ARGV[2])," +
      "c('pttl','message-list/'..ARGV[1])," +
      "n and 1 or 0}",

  uuidPost: "local c=redis.call;" +
    //ARGV[1]: uuid
    //ARGV[2]: body
    "local t=ARGV[3];" + //ttl
    //ARGV[4]: Location UUID
    // Get the UUID of our match if we're a matched connection
    "local m=c('get','match/'..ARGV[1]);" +
    // Get the name of our offer if we're an unanswered offer
    "local n=c('get','offer-name/'..ARGV[1]);" +
    // Get the UUID of our offer if we're an offer answerer
    "local o=c('get','offer-answer/'..ARGV[1]);" +
    // The length of our list after rpushx, if pushing message
    "local l=0;" +
    // If we're a matched connection
    "if m then " +
      // Post the message to our match's list
      "l=c('rpushx','message-list/'..m,ARGV[2]);" +
      // Publish the message for subscribed listeners on the other end
      "c('publish','message/'..m..'/'..(l-1),ARGV[2]);" +
      "return {l};" +
    // If we're an unanswered offer
    "elseif n then " +
      // Post the message to our future match's list
      "l=c('rpushx','offer-list/'..n,ARGV[2]);" +
      "return {l};" +
    // If we're a reply location for answering offers
    "elseif o then " +
      // Disconnect this offer answerer
      "c('del','offer-answer/'..ARGV[1]);" +
      // Rewire offer updates to go to the answerer
      "c('rename','offer-list/'..c('get','offer-name/'..o)," +
        "'message-list/'..ARGV[4]);" +
      "c('pexpire','message-list/'..ARGV[4],t);" +
      "c('psetex','match/'..o,t,ARGV[4]);" +
      // Delete offer record for this answerer
      "c('del','offer-reply-location/'..c('get','offer-name/'..o));" +
      // Create the message list
      "l=c('rpush','message-list/'..o,ARGV[2]);" +
      "c('pexpire','message-list/'..o,t);" +
      // Publish the new message for subscribed listeners from the offerer
      "c('publish','message/'..o..'/0',ARGV[2]);" +
      "return {l,ARGV[4]};" +
    "else " +
      "return {0};" +
    "end",

  uuidPut: "local c=redis.call;" +
    //ARGV[1]: uuid
    //ARGV[2]: index
    //ARGV[3]: body
    // Get the UUID of our match if we're a matched connection
    "local m=c('get','match/'..ARGV[1]);" +
    // Get the name of our offer if we're an unanswered offer
    "local n=c('get','offer-name/'..ARGV[1]);" +
    // If this UUID is present for handling PUTs
    "if m or n then" +
      "local l;" +
      "if m then " +
        "l=c('lset','message-list/'..m,ARGV[2],ARGV[3]);" +
        "if l.ok then c('publish','message/'..m..'/'..ARGV[2],ARGV[3]) end;" +
      "elseif n then " +
        "l=c('lset','offer-list/'..n,ARGV[2],ARGV[3]);" +
      "else return 0;end;" +
    "return l.ok and 1 or 0"
};
