module.exports = ["local c=redis.call",
  //ARGV[1]: name
  //ARGV[2]: body
  "local t=ARGV[3]", //ttl
  //ARGV[4]: Location UUID
  //ARGV[5]: Reply-Location UUID
  "local s='psetex'",
  // Check if there's already an offer at this name
  "local o=c('lindex','offer-list/'..ARGV[1],0)",
  // If there's an offer at this name, return it and the reply location
  "if o then return {o,c('get','offer-reply-location/'..ARGV[1])}",
  // If the name is not currently occupied by an offer
  "else",
    // Set location for responses
    "c(s,'offer-answer/'..ARGV[5],t,ARGV[4])",
    "c(s,'offer-reply-location/'..ARGV[1],t,ARGV[5])",
    // Set name and UUID for TTL refresh on get
    "c(s,'offer-name/'..ARGV[4],t,ARGV[1])",
    // Set initial offer value
    "c('rpush','offer-list/'..ARGV[1],ARGV[2])",
    "c('pexpire','offer-list/'..ARGV[1],t)",
    "return {false}",
  "end"].join('\n');
  