var express = require('express');
var offeranswer = require('offeranswer');

module.exports = function(cfg){
  var app = express();
  
  var oarApp = offeranswer(cfg);
  
  app.use(oarApp);
  
  app.get('/phrase/:phrase', function(req,res){
    oarApp.getOfferAt('phrase/' + req.params.phrase, function(err,content){
      if(content) {
        res.set("Chatphrase-Offer-At",content).send();
      } else {
        oarApp.getOfferAt('phrase/' + req.params.phrase,function(err,content){
          res.set("Chatphrase-Offer-To",content).send();
        });
      }
    });
  });
};