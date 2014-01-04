module.exports = function(db) {
  // Function for outer app to use to handle offer GET requests
  return function offerGet(path, req, res, next) {
    db.multi()

    // Get the offer at this path, if there is one
    .lindex('get/path/' + path, 0)

    // Get the UUID for answers to answer on, if there is an offer
    .get('location/path/' + path)

    // Don't refresh the TTL for either one- the other end refreshes them on
    // request, and if the other end stops requesting them, they should expire

    .exec(function(err, results){
      if (err) return next(err);

      // If there is an offer at this path
      if (results[0]) {
        // Reply with the offer and the location to respond to
        // (see note about urlPrefix in offeranswer.js)
        return res.header('Location', req.urlPrefix + '/' + results[1])
          .send(200,results[0]);

      // Otherwise, send a 404
      } else {
        return res.send(404);
      }
    });
  };
};