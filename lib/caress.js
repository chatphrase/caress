var express = require('express');
var offeranswer = require('./offeranswer.js');

module.exports = function(cfg){
  var app = express();

  var oarApp = offeranswer(cfg);

  app.use(oarApp);

  app.get('/offers/:phrase', function (req,res,next) {
    oarApp.offerGet(req.params.phrase, req, res, next);
  });

  app.post('/offers/:phrase', function (req,res,next) {
    oarApp.offerPost(req.params.phrase, req, res, next);
  });

  return app;
};
