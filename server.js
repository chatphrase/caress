var cfg = require("envigor")();
var app = require('./lib/caress.js')(cfg);
var server = require('http').createServer(app);

server.listen(cfg.port || 3000);
