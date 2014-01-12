/*global describe it*/

var local = require('./util/localrq.js');
var assertCb = require('./util/assertcbs.js');

describe("UUIDs", function() {
  describe("that don't exist", function() {
    describe("should 404", function() {
      it("on get", function(done) {
        local.get('/00000000-0000-0000-0000-000000000000',
          assertCb.status(404, done));
      });
      it("on put", function(done) {
        local.put('/00000000-0000-0000-0000-000000000000','',
          assertCb.status(404, done));
      });
      it("on post", function(done) {
        local.post('/00000000-0000-0000-0000-000000000000','',
          assertCb.status(404, done));
      });
    });
  });
});
