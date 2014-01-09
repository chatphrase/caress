module.exports = function(db) {
  // Function for outer app to use to handle offer GET requests
  return function offerGet(req, res, next) {
    var name = req.params.phrase;

    db.multi()

    // Get the offer at this name, if there is one
    .lindex('offer-list/' + name, 0)

    // Get the UUID for answers to answer on, if there is an offer
    .get('offer-reply-location/' + name)

    // Don't refresh the TTL for either one- the other end refreshes them on
    // request, and if the other end stops requesting them, they should expire

    .exec(function(err, results){
      if (err) return next(err);

      // If there is an offer at this name
      if (results[0]) {
        // Reply with the offer and the location to respond to
        return res.header('Location', req.urlPrefix + '/' + results[1])
          .send(200,results[0]);

      // Otherwise, send a 404
      } else {
        return res.send(404);
      }
    });
  };
};
