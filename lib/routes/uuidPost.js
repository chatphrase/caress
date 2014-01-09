var procs = require('../procs.js');
var uuid = require('uuid');

module.exports = function(db, pollWait, itemTTL) {
  return function uuidPost(req, res, next) {
    var id = req.params.path;

    // Ignore any subindex. POSTing to a subpath should really be an error but

    db.multi()

    // Get:
    // The ID of the other end, if we're connected
    .get('match/' + id)
    // The name of our offer, if we're an unanswered offer
    .get('offer-name/' + id)
    // The ID and name of the offer we're answering, if we're a reply location
    .get('offer-answer/' + id)
    .get('offer-answer->name/' + id)

    .exec(function(err,results) {
      if (err) return next(err);

      function respondOk(err) {
        if (err) return next(err);

        // Respond that the post was received successfully
        res.send(200);
      }

      // If we're connected
      if (results[0]) {

        // Add the new message
        db.rpush('message-list/' + results[0], req.body,
          // Once it's been added, announce it
          // (can't be simultaneous because we need the index we added to)
          function publishNew(err, length) {
            if(err) return next(err);
            db.publish('message/' + results[0] + '/' + (length-1), req.body,
              respondOk);
          });

      // If we're an unanswered offer
      } else if (results[1]) {

        // Add the new message
        // As we have no receiver ID to announce to, we respond immediately.
        db.rpush('offer-list/' + results[1], req.body, respondOk);

      // If we're a reply location for answering offers
      } else if(results[2]) {

        // Create a new UUID for this answerer to update / listen on
        var privateId = uuid.v4();

        procs.answerOffer(db.multi(),
          privateId, results[0], results[1], results[2], req.body, itemTTL)
        .exec(function(err) {
          if (err) return next(err);

          // Respond that the post was received successfully
          res.header('Location', req.urlPrefix + '/' + privateId)
            .send(201);
        });
      } else {
        //If no post handler here, send a 404 Not Found response
        res.send(404);
      }
    });
  };
};
