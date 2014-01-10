var script = require('../redis-scripts/offerGet.js');
module.exports = function(db) {
  // Function for outer app to use to handle offer GET requests
  return function offerGet(req, res, next) {
    var name = req.params.phrase;

    db.eval(script, 0, name, function(err, results) {
      if (err) return next(err);

      var offer = results[0];
      var replyLoc = results[1];

      // If there is an offer at this name
      if (offer) {
        // Reply with the offer and the location to respond to
        return res.header('Reply-Location', req.urlPrefix + '/' + replyLoc)
          .send(200,offer);

      // Otherwise, send a 404
      } else {
        return res.send(404);
      }
    });
  };
};
