var local = require('./localrq.js');
var assertCb = require('./assertcbs.js');
var queue = require('queue-async');

exports.messageTest = function messageTest(sendUrl, receiveUrl, body, cb) {
  return getAndSendNow(GetSendTest(sendUrl, receiveUrl), body, cb);
};

function getAndSendNow(test, body, cb) {
  return queue().defer(test.get).defer(test.send, body).await(cb);
}

// Calls a "get" function (Expected to be some kind of closure around a
// request() call) until the status isn't 204 (No Content).
function getLoop(getF, cb) {
  function checkBody(err, res, body) {
    if (err) return cb(err);
    // if the body isn't yet present, loop
    else if (res.statusCode == 204) getF(checkBody);
    else cb(err, res, body);
  }
  getF(checkBody);
}

function ExpectedBodyTest(getF, sendF){
  var expectBody;
  return {
    get: function(cb) {
      getLoop(getF, assertCb.statusAndBody(200, expectBody, cb));
    },
    send: function(body, cb){
      expectBody = body;
      sendF(body, cb);
    }
  };
}

function GetSendTest(sendUrl, receiveUrl) {
  return ExpectedBodyTest(
    function get(cb){local.get(receiveUrl, cb)},
    function send(body, cb){local.send(sendUrl, body, cb)});
}

function TestSequencer(sender, receiver, init) {
  var frame = init || 1;
  return function() {
    return GetSendTest(sender, receiver + '/' + (frame++));
  };
}

function OffererAnswererTestSequencers(offererId, answererId) {
  return {
    offerer: TestSequencer(offererId, answererId),
    answerer: TestSequencer(answererId, offererId)
  };
}

function cbCreatedLocation(cb){
  return assertCb.status(201, function(err, res, body) {
    if (err) return cb(err);
    return cb(err, res.headers.location);
  });
}

exports.offerTest =
function offerTest(offerPoint, obody, cb) {
  local.post(offerPoint, obody, cbCreatedLocation(cb));
};

exports.answerTest =
function answerTest(offerPoint, obody, offererId, cb) {
  local.get(offerPoint,
    assertCb.statusAndBody(200, obody, function(err, res, body) {
    if (err) return cb(err);
    var replyLocation = res.headers['reply-location'];

    return cb(err, ExpectedBodyTest(
      function get(cb) {local.get(offererId, cb)},
      function send(body, cb) {
        local.post(replyLocation, body, cbCreatedLocation(cb));
      }));
  }));
};

exports.offerTestAnswerer =
function offerTestAnswerer(offerPoint, obody, cb) {
  offerTest(offerPoint, obody, function(err, offererId) {
    if (err) return cb(err);
    return cb(err, function answerer(abody) {
      answerTest(offerPoint, obody, offererId, function(err, test) {
        if (err) return cb(err);
        getAndSendNow(test, abody, cb);
      });
    });
  });
};

exports.answerOfferTest =
function answerOfferTest(offerPoint, obody, abody, cb) {
  offerTest(offerPoint, obody, function(err, offererId) {
    if (err) return cb(err);
    return answerTest(offerPoint, obody, offererId, function(err, test) {
      if (err) return cb(err);
      getAndSendNow(test, abody, cb);
    });
  });
};
