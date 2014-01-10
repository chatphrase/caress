/*global describe it*/

var assert = require('assert');
var request = require('request');
var queue = require('queue-async');

// Utility functions

function cbwrap(func) {
  var args = Array.prototype.slice.call(arguments,1);
  return function() {
    return func.apply(this,args);
  };
}

var localRoot = 'http://localhost:' + process.env.PORT || 3000;

function localGet(url, cb) {
  return request({url: localRoot + url, encoding: 'utf8',
    method: 'GET'}, assertServerSuccess(cb));
}

function localPost(url, body, cb) {
  return request({url: localRoot + url, encoding: 'utf8',
    method: 'POST', body: body}, assertServerSuccess(cb));
}

function assertServerSuccess(cb) {
  return function(err, res, body) {
    if (res.statusCode >= 500) {
      assert.fail(res.statusCode, 500, body, '<');
    } else cb && cb(err,res,body);
  };
}

function assertStatus(expected, cb) {
  return function (err, res, body) {
    if (err) return cb(err);

    assert.equal(res.statusCode, expected);
    cb && cb(err, res, body);
  };
}

function assertStatusAndBody(expectedStatus, expectedBody, cb) {
  return function (err, res, body) {
    if (err) return cb(err);

    assert.deepEqual(
      {status: res.statusCode, body: body},
      {status: expectedStatus, body: expectedBody});
    cb && cb(err, res, body);
  };
}

describe("Offer-Answer flow", function() {
  describe("missing offers", function() {
    it("should 404", function(done) {
      localGet('/offers/nothing', assertStatus(404,done));
    });
    it("should 404 even when another offer is posted", function(done) {
      localPost('/offers/do','dew',
        cbwrap(localGet,'/offers/do-without',assertStatus(404,done)));
    });
  });
  describe("initial offers", function() {
    it("should post and be readable", function(done) {
      var endpoint = '/offers/telegram';
      var body = 'test body';
      localPost(endpoint,body,assertStatus(201,
        cbwrap(localGet,endpoint,assertStatusAndBody(200,body,done))));
    });
  });
  describe("answers to offers", function() {
    it("should free up the offer path", function(done) {
      var endpoint = '/offers/flashpoint';
      var obody = 'offer body';
      var abody = 'answer body';
      localPost(endpoint,obody,assertStatus(201,
        cbwrap(localGet,endpoint,assertStatus(200,answerOffer))));

      function answerOffer(err, res, body) {
        localPost(res.headers['reply-location'], abody,
          cbwrap(localGet,endpoint,assertStatus(404,done)));
      }
    });
    it("should be received by the offerer", function(done) {
      var endpoint = '/offers/get-this';
      var obody = 'offer initial body';
      var abody = 'answer initial body';
      localPost(endpoint,obody,listenForAnswer);

      function listenForAnswer(err, res, body) {
        localGet(res.headers.location,
          assertStatusAndBody(200, abody, done));
        localGet(endpoint,answerOffer);
      }

      function answerOffer(err, res, body) {
        localPost(res.headers['reply-location'], abody);
      }
    });
    it("should not be received by other offers", function(done) {
      // This function calls a callback that takes a function that sets a
      // callback for a call that was made *earlier*. This makes sense in my
      // head, even though it's totally bananas in code.
      function timeyWimeyBall(endpoint, obody, cb) {
        localPost(endpoint, obody, function(err, res, body) {
          // This will be set a couple callbacks down
          var expectedAnswer, finalCallback;

          localGet(res.headers.location, receiveAnswer);

          cb(err,function answerer(abody, fcb) {
            expectedAnswer = abody; finalCallback = fcb;
            localGet(endpoint,function(err,res,body){
              localPost(res.headers['reply-location'], abody);
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
