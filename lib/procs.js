module.exports = {
  offerPost: function (multi, privateId, name, replyLocId, body, ttl) {
    return multi
      // Set location for responses
      .set('offer-answer/' + replyLocId, privateId, 'PX', ttl)
      .set('offer-reply-location/' + name, replyLocId, 'PX', ttl)

      // Set name and UUID for TTL refresh on get
      .set('offer-name/' + privateId, name, 'PX', ttl)

      // Cached double-indexes
      // If procs are done on the server, we won't need these
      // For unhooking offer
      .set('offer-answer->name/' + replyLocId, name, 'PX', ttl)
      // For refreshing reply-location data TTL
      .set('offer-name->reply-location/' + privateId, replyLocId, 'PX', ttl)

      // Set initial value
      .rpush('offer-list/' + name, body)
      .pexpire('offer-list/' + name, ttl);
  },

  answerOffer: function (multi, privateId, offerId, offerName, locId, body, ttl) {
    // TODO: WATCH on this transaction?
    // Currently deferred in favor of later converting this transaction to a
    // Lua script to be EVAL'd

    return multi
      // Disconnect this offer answer handler
      .del('offer-answer/' + locId)

      // Rewire offer updates to go to this answerer
      .rename('offer-list/' + offerName, 'message-list/' + privateId)
      .pexpire('message-list/' + privateId, ttl)
      .set('match/' + offerId, privateId, 'PX', ttl)

      // Delete offer record for this answerer
      .del('offer-reply-location/' + offerName)

      // Delete double-indexes
      .del('offer-answer->name/' + locId)
      .del('offer-name->reply-location/' + offerId)

      // Create the message list
      .rpush('message-list/' + offerId, body)
      .pexpire('message-list/' + offerId, ttl)

      // publish the new message to anybody currently asking
      .publish('messages/' + offerId + '/0', body);
  },

  getQuery: function(multi, id, index, ttl) {
    return multi
      // Get any content for this path.
      .lindex('message-list/' + id, index)

      // Get if there's content for ANY path under this ID.
      .exists('message-list/' + id)

      // Get the path to update if we're waiting for an answer,
      // so we know if emptiness is expected and what location to update.
      .get('offer-name/' + id)

      // Get the Answer Location UUID to update if we're waiting for an answer,
      // so we don't have to get the name specified in the previous field.
      .get('offer-name->reply-location/' + id)

      // Get the ID of our match (if present), so we can refresh the TTL on our
      // messages to them.
      .get('match/' + id)

      // Get the TTL in milliseconds of our received messages (if present).
      // Not currently used, but could be used to have quicker response when
      // the other end drops out.
      .pttl('message-list/' + id)

      // Refresh the TTL on the fields associated with this ID (that we can).
      .pexpire('match/' + id, ttl)
      .pexpire('offer-name/' + id, ttl)
      .pexpire('offer-name->reply-location/' + id, ttl);

      // We do NOT refresh the TTL of the other end's messages to us
      // ('message-list/' + id), as that is the job of the other end's
      // updates and listening GET polls.
  }
};
