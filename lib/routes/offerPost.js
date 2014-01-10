var script = require('../redis-scripts/offerPost.js');
var uuid = require('uuid');

module.exports = function(db, itemTTL) {
  // Function for outer app to use to handle offer POST requests
  return function offerPost(req, res, next) {
    var name = req.params.phrase;

    // create the UUID for this offerer to update / listen at
    var privateId = uuid.v4();

    // Create the UUID for answers to post to
    var respondToId = uuid.v4();

    db.eval(script, 0, name, req.body, itemTTL, privateId, respondToId,
      function(err, results) {

      if (err) return next(err);

      var offer = results[0];
      var replyLoc = results[1];

      // If there's already an offer at this name
      if (offer) {

        // Send a 303 See Other to direct the client to GET the content that is
        // already present at this name, along with the body of that offer
        // and the location to POST a reply to.
        // This is almost equivalent to doing the GET request itself, and
        // as such is arguably wrong, but I'm still fine with it.
        return res
          .header('Reply-Location', req.urlPrefix + '/' + replyLoc)
          .header('Location', req.originalUrl)
          .send(303, offer);

      // If this name was empty
      } else {

        // Tell the poster about the new location
        return res.header('Location', req.urlPrefix + '/' + privateId)
          .send(201);
      }
    });
  };
};
