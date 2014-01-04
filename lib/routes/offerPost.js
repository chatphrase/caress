var procs = require('../procs.js');
var uuid = require('uuid');

module.exports = function(db, itemTTL) {
  // Function for outer app to use to handle offer POST requests
  return function offerPost(req, res, next) {
    var path = req.params.phrase;

    // Check if there's already an offer on this path
    db.lindex('get/path/' + path, 0, function(err, offer){
      if (err) return next(err);

      // If there's already an offer on this path
      if (offer) {

        // Send a 303 See Other to direct the client to GET the content that is
        // already present on this path, along with the body of that offer.
        // (Debated using a 409 Conflict here, but decided against it)
        return res.header('Location', req.originalUrl).send(303, offer);

        // NOTE: It arguably shouldn't have a content body when sending this
        // response, or it should include the location to respond to, or
        // something, I don't know. This could maybe be made cooler.

      // If this path is empty
      } else {

        // create the UUID for this offerer to update / listen at
        var privateId = uuid.v4();

        // Create the UUID for answers to post to
        var respondToId = uuid.v4();

        procs.offerPost(db.multi(),
          privateId, path, respondToId, req.body, itemTTL)
        .exec(function(err){
          if (err) return next(err);
          // Respond with Created status and location for updates /
          // polling for a response
          return res.header('Location', req.urlPrefix + '/' + privateId)
            .send(201);
        });
      }
    });
  };
};
