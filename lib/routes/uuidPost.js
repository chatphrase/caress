var script = require('../redis-scripts/uuidPost.js');
var uuid = require('uuid');

module.exports = function(db, pollWait, itemTTL) {
  return function uuidPost(req, res, next) {
    var postingId = req.params.path;

    // Create a new UUID for an answerer to update / listen on
    var answererId = uuid.v4();

    db.eval(script, 0, postingId, req.body, itemTTL, answererId,
      function (err, results) { if (err) return next(err);

      // If we posted an answer
      if (results[1]) {
        // Respond with the new connection location
        res.header('Location', req.urlPrefix + '/' + answererId).send(201);
      // If we posted a message (list is now some number > 1 in length)
      } else if (results[0]) {
        // Respond that the post was received successfully
        res.send(200);
      // If we posted nothing
      } else {
        // send a 404 Not Found response
        res.send(404);
      }
    });
  };
};
