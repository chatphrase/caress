module.exports = ["local c=redis.call",
  //ARGV[1]: start name
  //ARGV[2]: new UUID
  //ARGV[3]: body
  "local t=ARGV[4]", //ttl
  // Get the UUID of any connection already waiting on this start
  "local w=c('get','start/'..ARGV[1])",
  // If someone is waiting at this start
  "if w then",
    // Clear the start
    "c('del','start/'..ARGV[1])",
    // Rewire updates to go to each other
    "c('del','start-name/'..w)",
    "c('psetex','match/'..w,t,ARGV[2])",
    "c('psetex','match/'..ARGV[2],t,w)",
    // Create and announce the start offer
    "c('rpush','message-list/'..w,ARGV[2])",
    "c('pexpire','message-list/'..w,t)",
    "c('publish','message/'..w..'/0',ARGV[2])",
    // Create special TTL record until the offering side gets a message
    "c('psetex','start-listless/'..ARGV[2],t,w)",
    "return 1",
  // If nobody is waiting at this start
  "else",
    // Set the start record
    "c('psetex','start/'..ARGV[1],t,ARGV[2])",
    // Set the reverse to refresh on GET
    "c('psetex','start-name/'..ARGV[2],t,ARGV[1])",
    "return 0",
  "end",
  ].join('\n');
