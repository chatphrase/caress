var script = require('../redis-scripts/switchPost.js');
var uuid = require('uuid');

module.exports = function(db, itemTTL) {
  return function switchPost(req, res, next) {
    var name = req.params.phrase;

    // Create a new UUID for an answerer to update / listen on
    var newId = uuid.v4();

    // Ignore any subindex. POSTing to a subpath should really be an error but

    db.eval(script, 0, name, newId, itemTTL,
      function (err, result) { if (err) return next(err);

      if (result) {
        // Respond with the new connection location
        res.header('Location', req.urlPrefix + '/' + newId)
          .send(result ? 201 : 302);
        res.send(404);
      }
    });
  };
};
