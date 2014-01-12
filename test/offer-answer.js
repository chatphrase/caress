/*global describe it*/

var local = require('./util/localrq.js');
var assertCb = require('./util/assertcbs.js');
var messaging = require('./util/messaging.js');
var queue = require('queue-async');

describe("Offer-Answer flow", function() {
  describe("missing offers", function() {
    it("should 404", function(done) {
      local.get('/offers/nothing', assertCb.status(404, done));
    });
    it("should 404 even when another offer is posted", function(done) {
      messaging.offerTest('/offers/do','dew',
        local.get.bind(null,'/offers/do-without', assertCb.status(404, done)));
    });
  });
  describe("initial offers", function() {
    it("should post and be readable", function(done) {
      var endpoint = '/offers/telegram';
      var body = 'test body';
      messaging.offerTest(endpoint, body,
        local.get.bind(null, endpoint,
          assertCb.statusAndBody(200, body, done)));
    });
  });
  describe("answers to offers", function() {
    it("should be received by the offerer", function(done) {
      var endpoint = '/offers/get-this';
      var obody = 'offer initial body';
      var abody = 'answer initial body';
      messaging.answerOfferTest(endpoint, obody, abody, done);
    });
    it("should free up the offer path", function(done) {
      var endpoint = '/offers/flashpoint';
      var obody = 'offer body';
      var abody = 'answer body';
      messaging.answerOfferTest(endpoint, obody, abody,
        local.get.bind(null, endpoint, assertCb.status(404, done)));
    });
    it("should not be received by other offers", function(done) {
      // This function calls a callback that takes a function that sets a
      // callback for a call that was made *earlier*. This makes sense in my
      // head, even though it's totally bananas in code.

      queue()
        .defer(messaging.offerTestAnswerer,
          '/offers/point-a', 'Offer A initial body')
        .defer(messaging.offerTestAnswerer,
          '/offers/point-b', 'Offer B initial body')
        .await(function(err, answererA, answererB) {
          queue()
            .defer(answererA,'Answer A initial body')
            .defer(answererB,'Answer B initial body')
            .await(done);
        });
    });
  });
});
