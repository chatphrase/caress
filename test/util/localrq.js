var request = require('request');
var localRoot = 'http://localhost:' + process.env.PORT || 3000;
var assert = require('assert');

exports.get = function localGet(url, cb) {
  return request({url: localRoot + url, encoding: 'utf8',
    method: 'GET'}, assertServerSuccess(cb));
};

exports.post = function localPost(url, body, cb) {
  return request({url: localRoot + url, encoding: 'utf8',
    method: 'POST', body: body}, assertServerSuccess(cb));
};

function assertServerSuccess(cb) {
  return function(err, res, body) {
    if (!err && res.statusCode >= 500) {
      assert.fail(res.statusCode, 500, body, '<');
    } else cb && cb(err,res,body);
  };
}
