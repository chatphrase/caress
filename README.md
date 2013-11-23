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

[envigor]:

## Understanding the DB layout

The different stages of connection in offeranswer.js use many different formats
of key names in Redis (that are somewhat opaque regarding what the
corresponding semantics of the value are). Here's a guide:

### get/path/{path}

The content of an offer on a "path" (the external non-UUID string to identify
an offer).

### location/path/{path}

The UUID for responses to an offer on a "path" (see above).

This is different from the convention for ancilliary data used with UUIDs
(which normally use the associated HTTP verb and a suffix) because "paths" are
allowed to contain any arbitrary strings, and as such cannot use optional
suffixes (as the suffix could then sneak its way into a non-suffixed update).

### post/id/{uuid}/to

The UUID used by the offerer listening for answers posted to the given UUID in
the key (used to set the destination when creating an answer handler).

### post/id/{uuid}/from

The "path" of the offer whose response location is the given UUID (used to
clear the offer on the "path" when an offer is answered).

### get/id/{uuid}

The content to read when GETting that UUID.

### get/id/{uuid}/offerat

The additional key to update (location/path/{path}) for an unanswered offer.
Used to refresh the TTL when polling for an unanswered offer via GET: also
denotes that the empty body of get/id/{uuid} does not denote a missing/dead
connection.

### put/id/{uuid}

The key to put content to when PUTting to that UUID.
