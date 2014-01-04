module.exports = {
  offerPost: function (multi, privateId, path, respondToId, body, ttl) {
    return multi
      // Set target for updates
      .set('put/id/' + privateId, 'get/path/' + path, 'PX', ttl)
      // "to" is set to itself as a sort of semaphore that this is a
      // waiting offer that posts messages to its "from" field
      .set('post/id/' + privateId + '/to', privateId, 'PX', ttl)
      // "from" is set to the path to add new messages while waiting
      // (intentionally semi-redundant to "put")
      .set('post/id/' + privateId + '/from', path, 'PX', ttl)

      // Set location for responses
      .set('location/path/' + path, respondToId, 'PX', ttl)

      // Set path and UUID for TTL refresh on get
      .set('get/id/' + privateId + '/offer/path', path, 'PX', ttl)
      .set('get/id/' + privateId + '/offer/id', respondToId, 'PX', ttl)

      // Set targets for response to modify
      .set('post/id/' + respondToId + '/to', privateId, 'PX', ttl)
      .set('post/id/' + respondToId + '/from', path, 'PX', ttl)

      // Set initial value
      .rpush('get/path/' + path, body)
      .pexpire('get/path/' + path, ttl);
  },

  answer: function (multi, privateId, offerId, offerPath, locId, body, ttl) {
    // TODO: WATCH on this transaction?
    // Currently deferred in favor of later converting this transaction to a
    // Lua script to be EVAL'd

    return multi
      // Rewire offer updates to go to this answerer
      .rename('get/path/' + offerPath, 'get/id/' + privateId)
      .pexpire('get/id/' + privateId, ttl)
      .set('put/id/' + offerId, 'get/id/' + privateId, 'PX', ttl)
      // We delete the "from" before we change the "to" so, worst case
      // scenario, we know this was being rewired if only the first goes
      // through
      .del('post/id/' + offerId + '/from')
      .set('post/id/' + offerId + '/to', privateId)

      // Delete the offer connections used for heartbeats on GET
      .del('get/id/' + offerId + '/offer/path')
      .del('get/id/' + offerId + '/offer/id')

      // Delete the data leading to this POST route
      .del('location/path/' + offerPath)
      .del('post/id/' + locId + '/to')
      .del('post/id/' + locId + '/from')

      // Set the put and post handlers for this answer
      .set('put/id/' + privateId, 'get/id/' + offerId, 'PX', ttl)
      .set('post/id/' + privateId + '/to', offerId, 'PX', ttl)

      // Create the message list
      .rpush('get/id/' + offerId, body)
      .pexpire('get/id/' + offerId, ttl)

      // publish the update to anybody currently asking
      .publish('get/id/' + offerId + '/0', body);
  },

  getQuery: function(multi, id, index, ttl) {
    return multi
      // Get any content for this path.
      .lindex('get/id/' + id, index)

      // Get if there's content for ANY path under this ID.
      .exists('get/id/' + id)

      // Get the target of PUT requests updating through this path
      // (for TTL refresh).
      .get('put/id/' + id)

      // Get the path to update if we're waiting for an answer,
      // so we know if emptiness is expected and what location to update.
      .get('get/id/' + id + '/offer/path')

      // Get the Answer Location UUID to update if we're waiting for an answer,
      // so we don't have to get the path specified in the previous field.
      .get('get/id/' + id + '/offer/id')

      // Get the TTL in milliseconds of the other end's content (if present).
      // Not currently used, but could be used to have quicker response when
      // the other end drops out.
      .pttl('get/id/' + id)

      // Refresh the TTL on the fields associated with this ID.
      .pexpire('put/id/' + id, ttl)
      .pexpire('post/id/' + id + '/to', ttl)
      .pexpire('post/id/' + id + '/from', ttl)
      .pexpire('get/id/' + id + '/offer/path', ttl)
      .pexpire('get/id/' + id + '/offer/id', ttl);

      // We do NOT refresh the TTL of the other end's messages to us
      // ('get/id/' + id), as that is the job of the other end's
      // updates and listening GET polls.
  }
};
