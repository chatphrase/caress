var script = require('../redis-scripts/uuidPut.js');
module.exports = function(db) {
  return function uuidPut(req, res, next) {
    var id = req.params.path;

    // The index of the message to update. Update 0 (the initial / root update)
    // if not specified.
    var upIndex = req.params.index || 0;

    // Get the message list or offer for this UUID to update
    db.eval(script, 0, id, upIndex, req.body, function(err, ok) {
      // If we found the list and updated it, return OK
      if (ok) return res.send(200);
      // Otherwise, return that something was missing
      else return res.send(404);
    });
  };
};
