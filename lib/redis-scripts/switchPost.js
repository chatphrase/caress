module.exports = ["local c=redis.call",
  //ARGV[1]: switch name
  //ARGV[2]: new UUID
  "local t=ARGV[3]", //ttl
  // Get the UUID of any connection already waiting on this switch
  "local w=c('get','switch/'..ARGV[1])",
  // If we're a reply location for answering offers
  "if w then",
    // Clear the switch
    "c('del','switch/'..ARGV[1])",
    // If there have already been messages sent
    "if c('exists','switch-list/'..ARGV[1])==1 then",
      // move them as a new message list
      "c('rename','switch-list/'..w),'message-list/'..ARGV[2])",
      "c('pexpire','message-list/'..ARGV[2],t)",
    "else",
      // Create special TTL record until the waiting side gets a message
      "c('psetex','switch-fresh/'..ARGV[2],t,w)",
    "end",
    // Rewire updates to go to each other
    "c('del','switch-name/'..w)",
    "c('psetex','match/'..w,t,ARGV[2])",
    "c('psetex','match/'..ARGV[2],t,w)",
    // Create special TTL record until the waiting side gets a message
    "c('psetex','switch-undeclared/'..w,t,ARGV[2])",
    "return 1",
  "else",
    // Set the switch record
    "c('psetex','switch/'..ARGV[1],t,ARGV[2])",
    // Set the reverse as a flag for the UUID
    "c('psetex','switch-name/'..ARGV[2],t,ARGV[1])",
    "return 0",
  "end",
  ].join('\n');
