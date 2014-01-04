module.exports = function(db) {
  return function uuidPut(req, res, next) {
    var pathUuid = req.params.path;

    // The index of the message to update. Update 0 (the initial / root update)
    // if not specified.
    var upIndex = req.params.index || 0;

    // Get the key for this UUID to update
    db.get('put/id/' + pathUuid, function(err,putTo) {
      if (err) return next(err);

      // If this UUID is present for handling PUTs
      if (putTo) {
        db.multi()

        // Note that this can fail (with an error) if the target of the
        // PUT has expired. The alternatives would be doing a GET check for
        // existence first (meh), putting a WATCH in the transaction (bleh),
        // and/or doing the transaction as a script (eh, not now).
        // As a fix I'm probably just going to rip PUTs out entirely since
        // they're no longer part of the usage flow and are, in fact,
        // undesirable in the new paradigm.
        .lset(putTo, upIndex, req.body)

        // Don't re-expire the messages as that is the getter's job

        // publish the update to anybody currently asking
        .publish(putTo, req.body)

        .exec(function(err, results) {
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
