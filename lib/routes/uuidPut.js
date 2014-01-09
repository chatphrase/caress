module.exports = function(db) {
  return function uuidPut(req, res, next) {
    var id = req.params.path;

    // The index of the message to update. Update 0 (the initial / root update)
    // if not specified.
    var upIndex = req.params.index || 0;

    // Get the message list or offer for this UUID to update
    db.multi().get('match/' + id).get('offer-name/' + id)
      .exec(function(err, results) { if (err) return next(err);

      var putTo = results[0] ? 'message-list/' + results[0] :
        results[1] ? 'offer-list/' + results[1] : null;

      // If this UUID is present for handling PUTs
      if (putTo) {
        var transaction = db.multi();

        // Note that this can fail (with an error) if the target of the
        // PUT has expired. Will be fixed by using a Lua script.
        transaction.lset(putTo, upIndex, req.body);

        // Don't refresh the messages as that is the getter's job

        // If we're publishing to a listening match
        if (results[0]) {
          // publish the update to anybody currently asking
          transaction.publish(
            'message/' + results[0] + '/' + upIndex,req.body);
        }

        transaction.exec(function(err, results) {
          if (err) return next(err);

          // If the target was updated,
          // respond that the put was completed successfully
          if (results[0]) return res.send(200);
          // Otherwise, return that we couldn't
          else return res.send(404);
        });

      } else {
        //If no put handler here, send a 404 Not Found response
        res.send(404);
      }
    });
  };
};
