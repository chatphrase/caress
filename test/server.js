/*global before*/
var cfg = require("envigor")();

// since we don't need to worry about latency to localhost,
// use really quick timeouts
var waitDuration = 250;
cfg.pollWait = cfg.afterWait = waitDuration;

cfg.port = cfg.port || 3000;

var app = require('../lib/caress.js')(cfg);

// This should probably be done as somesort of setup/teardown around each
// test case, with the redis DB being cleared in every teardown. But, for now,
// we're just going to declare that one server is good enough to catch the
// things we're looking for.
var server = require('http').createServer(app);

before(function(){
  server.listen(cfg.port);
});
