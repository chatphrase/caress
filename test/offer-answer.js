/*global describe it*/

var assert = require('assert');
var local = require('./util/localrq.js');
var assertCb = require('./util/assertcbs.js');
var cbwrap = require('./util/cbwrap.js');
var queue = require('queue-async');

describe("Offer-Answer flow", function() {
  describe("missing offers", function() {
    it("should 404", function(done) {
      local.get('/offers/nothing', assertCb.status(404,done));
    });
    it("should 404 even when another offer is posted", function(done) {
      local.post('/offers/do','dew',
        cbwrap(local.get,'/offers/do-without',assertCb.status(404,done)));
    });
  });
  describe("initial offers", function() {
    it("should post and be readable", function(done) {
      var endpoint = '/offers/telegram';
      var body = 'test body';
      local.post(endpoint,body,assertCb.status(201,
        cbwrap(local.get,endpoint,assertCb.statusAndBody(200,body,done))));
    });
  });
  describe("answers to offers", function() {
    it("should free up the offer path", function(done) {
      var endpoint = '/offers/flashpoint';
      var obody = 'offer body';
      var abody = 'answer body';
      local.post(endpoint,obody,assertCb.status(201,
        cbwrap(local.get,endpoint,assertCb.status(200,answerOffer))));

      function answerOffer(err, res, body) {
        local.post(res.headers['reply-location'], abody,
          cbwrap(local.get,endpoint,assertCb.status(404,done)));
      }
    });
    it("should be received by the offerer", function(done) {
      var endpoint = '/offers/get-this';
      var obody = 'offer initial body';
      var abody = 'answer initial body';
      local.post(endpoint,obody,listenForAnswer);

      function listenForAnswer(err, res, body) {
        local.get(res.headers.location,
          assertCb.statusAndBody(200, abody, done));
        local.get(endpoint,answerOffer);
      }

      function answerOffer(err, res, body) {
        local.post(res.headers['reply-location'], abody);
      }
    });
    it("should not be received by other offers", function(done) {
      // This function calls a callback that takes a function that sets a
      // callback for a call that was made *earlier*. This makes sense in my
      // head, even though it's totally bananas in code.
      function timeyWimeyBall(endpoint, obody, cb) {
        local.post(endpoint, obody, function(err, res, body) {
          // This will be set a couple callbacks down
          var expectedAnswer, finalCallback;

          local.get(res.headers.location, receiveAnswer);

          cb(err,function answerer(abody, fcb) {
            expectedAnswer = abody; finalCallback = fcb;
            local.get(endpoint,function(err,res,body){
              local.post(res.headers['reply-location'], abody);
            });
          });

          function receiveAnswer(err, res, body) {
            assert.equal(body, expectedAnswer);
            finalCallback && finalCallback(err);
          }
        });
      }

      queue()
        .defer(timeyWimeyBall, '/offers/point-a', 'Offer A initial body')
        .defer(timeyWimeyBall, '/offers/point-b', 'Offer B initial body')
        .await(function(err, answererA, answererB){
          queue()
            .defer(answererA,'Answer A initial body')
            .defer(answererB,'Answer B initial body')
            .await(done);
        });
    });
  });
});
