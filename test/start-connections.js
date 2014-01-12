/*global describe it*/

var local = require('./util/localrq.js');
var assertCb = require('./util/assertcbs.js');
var messaging = require('./util/messaging.js');
var queue = require('queue-async');

describe("Start flow", function() {
  describe("getting starts", function() {
    it("should 404", function(done) {
      local.get('/start/nothing', assertCb.status(404, done));
    });
  });
  describe("starts", function() {
    it("should get a 202 for the first post", function(done) {
      var endpoint = '/start/all-new';
      var body = 'should not appear';
      local.post(endpoint, body, assertCb.status(202, done));
    });
    it("should get a 201 for the second post", function(done) {
      var endpoint = '/start/fresh';
      var obody = 'should disappear';
      var abody = 'test body';
      local.post(endpoint, obody, assertCb.status(202,
        function(err, res, body) { if (err) return done(err);
          local.post(endpoint, abody, assertCb.status(201, done));
        }));
    });
  });
  describe("singles", function() {
    it("should reject POSTs", function(done) {
      var endpoint = '/start/unpostable';
      var ibody = 'forgotten body';
      var obody = 'one bad body';
      local.post(endpoint, ibody, assertCb.status(202,
        function(err, res, body) { if(err) return done(err);
          local.post(res.headers.location,obody,assertCb.status(404,done));
        }));
    });
    it("should have no content at first", function(done) {
      var endpoint = '/start/single-going-steady';
      var obody = 'unused rejected body';
      local.post(endpoint, obody, assertCb.status(202,
        function(err, res, body) { if(err) return done(err);
          local.get(res.headers.location,assertCb.status(204,done));
        }));
    });
    it("should get content from matches", function(done) {
      var endpoint = '/start/eagerly-awaiting';
      var obody = 'irrelevant first body';
      var abody = 'relevant second body';
      local.post(endpoint, obody, assertCb.status(202,
        function(err, res, body) { if(err) return done(err);
          messaging.getLoop(local.get.bind(res.headers.location),
            assertCb.statusAndBody(200,abody,done));
          local.post(endpoint, abody, assertCb.status(201,
            function(err, res, body) { if(err) return done(err); }
          ));
        }));
    });
  });
  describe("matches", function() {
    it("should have no content at first", function(done) {
      var endpoint = '/start/this-not-that';
      var obody = 'discarded initial body';
      var abody = 'other initial body';
      var q = queue();
      local.post(endpoint, obody, assertCb.status(202,
        function(err, res, body) { if(err) return done(err);
          // get from the first for timeout reasons
          q.defer(messaging.getLoop, local.get.bind(res.headers.location));
          local.post(endpoint, abody, assertCb.status(201,
            function(err, res, body) { if(err) return done(err);
              q.defer(function(cb) {
                local.get(res.headers.location,assertCb.status(204,cb));
              });
              q.await(done);
            }
          ));
        }));
    });
    it("should get content when posted from other side", function(done) {
      var endpoint = '/start/this-not-that';
      var obody = 'discarded initial body';
      var abody = 'other initial body';
      var rbody = 'responding tertiary body';
      local.post(endpoint, obody, assertCb.status(202,
        function(err, res, body) { if(err) return done(err);
          var firstSide = res.headers.location;
          // get from the first for timeout reasons
          messaging.getLoop(local.get.bind(res.headers.location),
            assertCb.statusAndBody(200,abody));
          local.post(endpoint, abody, assertCb.status(201,
            function(err, res, body) { if(err) return done(err);
              messaging.getLoop(local.get.bind(res.headers.location),
                assertCb.statusAndBody(200,rbody,done));
              local.post(firstSide, rbody, assertCb.status(200,
                function(err, res, body) { if(err) return done(err); }
              ));
            }
          ));
        }));
    });
  });
});
