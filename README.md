# caress

Chatphrase Asynchronous Representational State Signaling

## Minimum requirements

Note that this system uses [options for the SET command][SET options] that
were added in Redis 2.6.12, and as such **requires at least Redis 2.6.12** to
run.

[SET options]: http://redis.io/commands/set

## Configuration

Configuration for the database espects a "redis" object with "port" and
"hostname", as used by [envigor][].

[envigor]: https://github.com/stuartpb/envigor

## Understanding the DB layout

Due to the labyrinthine and chaotic evolution of this project, the different
stages and states of connection in caress use many different formats
of key names in Redis with meanings that vary dependent on the values of other
keys. Here's a guide:

### get/path/{path}

The content of an offer on a "path" (the external non-UUID string to identify
an offer, ie. the phrase for a Chatphrase offer).

### location/path/{path}

The UUID for responses to an offer on a "path" (see above).

This is different from the convention for ancilliary data used with UUIDs
(which normally use the associated HTTP verb and a suffix) because "paths" are
allowed to contain any arbitrary strings, and as such cannot use optional
suffixes (as the suffix could then sneak its way into a non-suffixed update).

### post/id/{uuid}/to

For offer answers, the UUID used by the offerer listening for answers posted to
the given UUID in the key (used to set the destination when creating an answer
handler).

For answerers and answered offers, the UUID of the other end (similar to
put/id/{uuid}, but with the UUID rather than the "get/id/{uuid}" key), for use
in posting new messages to the message list.

For unanswered offers, the same value as {uuid}, to signify that the value of
post/id/{uuid}/from should be used rather than post/id/{uuid}/to.

### post/id/{uuid}/from

For offer asnwer UUIDs, the "path" of the offer whose response location is the
given UUID (used to clear the offer on the "path" when an offer is answered).

For unanswered offers, this is the path that new messages will be POSTed to.

### get/id/{uuid}

The list of messages to read when GETting that UUID. The 0-index will be gotten
when GETting the root.

### get/id/{uuid}/offer/path

The path location to update (location/path/{path}) for an unanswered offer.
Used to refresh the TTL when polling for an unanswered offer via GET: also
denotes that the empty body of get/id/{uuid} does not denote a missing/dead
connection.

### get/id/{uuid}/offer/id

The UUID value to update (post/id/{uuid}/from, post/id/{uuid}/to) for an
unanswered offer, stored so as to not require a second trip to dereference
get/id/{uuid}/offer/path.

### put/id/{uuid}

The key to put content to when PUTting to that UUID.
