var procs = require('../procs.js');
var uuid = require('uuid');

module.exports = function(db, pollWait, itemTTL) {
  return function uuidPost(req, res, next) {
    var pathUuid = req.params.path;

    // Ignore any subindex. POSTing to a subpath should really be an error but

    db.multi()

    // Get the UUID that the offerer is updating / listening on, or the UUID
    // that the other end is at if it's connected
    .get('post/id/' + pathUuid + '/to')

    // Get the path that the offer is at
    .get('post/id/' + pathUuid + '/from')

    .exec(function(err,results) {
      if (err) return next(err);

      function respondOk(err) {
        if (err) return next(err);

        // Respond that the post was received successfully
        res.send(200);
      }

      // If there is an offer listening for POSTs on this UUID
      if (results[0]) {

        // Note that, since there's no "push only if exists" param for rpush,
        // rpushes in here can all push to a list that has been expired since
        // we got the paths, and as such, *in theory*, create a new list.
        // This is mostly harmless (the worst that could happen is we get some
        // messages that don't expire unless somebody who stopped reading reads
        // them again, in which case they'll just be garbage that causes an
        // error to a client that was doing unspecified behavior in the first
        // place) and unlikely (in normal operation, if a request is going to
        // come in, it's going to be significantly before the timeout
        // threshold), but is still something to keep in mind for future
        // improvement (EVAL-based procs should close this gap).

        // Technically such an event could be post-facto detected (reversing
        // any rpush that resulted in a length of 1), but I honestly don't
        // feel it's warranted, for the reasons enumerated above (I'll probably
        // just do the transaction as a script before then).

        // if this is a waiting offer's path to update itself
        if (results[0] == pathUuid) {
          // If we have the path we're waiting on (which we will unless
          // something has briefly and unexpectly failed)
          if (results[1]) {
            // Add the new message
            // We respond immediately after adding because we don't need to
            // publish if we're POSTing messages from an unanswered offer, as
            // its unanswered state means nobody will be listening
            db.rpush('get/path/' + results[1], req.body, respondOk);

          // If we're pointing to ourselves but have no path to update
          } else {
            // Hypothetical timing glitch that can't really happen due to
            // procs.
            res.send(500, 'Try Again');
          }

        // If this is an endpoint that posts to a symmetric endpoint, not an
        // unanswered offer (which would have a "from" field)
        } else if (!results[1]) {
          // Add the new message
          db.rpush('get/id/' + results[0], req.body,
            // Once it's been added, announce it
            // (can't be simultaneous because we need the index we added to)
            function publishNew(err, length) {
              if(err) return next(err);
              db.publish('get/id/' + results[0] + '/' + (length-1), req.body,
                respondOk);
            });

        // If this is the UUID for an Answer (it has a "from" field)
        } else {
          // Create a new UUID for this answerer to update / listen on
          var privateId = uuid.v4();

          procs.answer(db.multi(),
            privateId, results[0], results[1], pathUuid, req.body, itemTTL)
          .exec(function(err) {
            if (err) return next(err);

            // Respond that the post was received successfully
            res.header('Location', req.urlPrefix + '/' + privateId)
              .send(201);
          });
        }
      } else {
        //If no post handler here, send a 404 Not Found response
        res.send(404);
      }
    });
  };
};
