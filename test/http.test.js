/*global describe it*/

var assert = require('assert');
var request = require('request');
var queue = require('queue-async');

var cfg = require("envigor")();

// since we don't need to worry about latency to localhost,
// use really quick timeouts
var waitDuration = 250;
cfg.pollWait = cfg.afterWait = waitDuration;
var timeoutLength = waitDuration * 3;

cfg.port = cfg.port || 3000;

var app = require('../lib/caress.js')(cfg);

// This should probably be done as somesort of setup/teardown around each
// test case, with the redis DB being cleared in every teardown. But, for now,
// we're just going to declare that noe server is good enough to catch the
// things we're looking for.
var server = require('http').createServer(app);
server.listen(cfg.port);

// Utility functions

function cbwrap(func) {
  var args = Array.prototype.slice.call(arguments,1);
  return function() {
    return func.apply(this,args);
  };
}

var localRoot = 'http://localhost:' + cfg.port;

function localGet(url, cb) {
  return request(localRoot + url, cb);
}

function localPost(url, body, cb) {
  return request({url: localRoot + url,
    method: 'POST', body: body}, cb);
}

function assertStatus(rightStatus, cb) {
  return function (err, res, body) {
    if (err) return cb(err);

    assert.equal(res.statusCode, rightStatus);
    cb && cb(err, res, body);
  };
}

function assertBody(rightBody, cb) {
  return function (err, res, body) {
    if (err) return cb(err);

    assert.equal(body, rightBody);
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
        cbwrap(localGet,endpoint,assertStatus(200,assertBody(body,done)))));
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
        localPost(res.headers.location, abody,
          cbwrap(localGet,endpoint,assertStatus(404,done)));
      }
    });
    it("should be received by the offerer", function(done) {
      var endpoint = '/offers/get-this';
      var obody = 'offer initial body';
      var abody = 'answer initial body';
      localPost(endpoint,obody,listenForAnswer);

      function listenForAnswer(err, res, body) {
        localGet(res.headers.location,assertBody(abody, done));
        localGet(endpoint,answerOffer);
      }

      function answerOffer(err, res, body) {
        localPost(res.headers.location, abody);
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
              localPost(res.headers.location, abody);
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
