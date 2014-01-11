var assert = require('assert');

exports.status = function assertStatus(expected, cb) {
  return function (err, res, body) {
    if (err) return cb(err);

    assert.equal(res.statusCode, expected);
    cb && cb(err, res, body);
  };
};

exports.statusAndBody =
function assertStatusAndBody(expectedStatus, expectedBody, cb) {
  return function (err, res, body) {
    if (err) return cb(err);

    assert.deepEqual(
      {status: res.statusCode, body: body},
      {status: expectedStatus, body: expectedBody});
    cb && cb(err, res, body);
  };
};
