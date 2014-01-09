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

## DB layout

Different keys are associated with different states:

### Initial offers

#### offer-list/{offer name}

The list of sent messages for the named unanswered offer.

Until the name is answered, only the first item will be provided to agents
requesting the offer via HTTP.

#### offer-reply-location/{offer name}

The UUID of the endpoint accepting answers to the named unanswered offer.

#### offer-name/{uuid}

The name of the offer that this UUID is listening for answers to.

#### offer-answer/{uuid}

The UUID listening for answers from the given UUID.

#### offer-answer->name/{uuid}

The name of the offer the UUID answered by the given UUID is on.

This allows the name to be retrieved in one request without subsequently
further indexing offer-name/{uuid from offer-answer/{uuid}}.

#### offer-name->reply-location/{uuid}

The UUID for receiving answers for the given UUID. This is the reverse of
offer-answer/{uuid}.

This allows the name to be retrieved in one request without subsequently
further indexing offer-reply-location/{offer name from offer-name/{uuid}}.

### Matched endpoints

#### message-list/{uuid}

The list of sent messages for the named unanswered offer.

#### match/{uuid}

The UUID the given UUID is connected to. Messages should be sent to
message-list/{uuid from match/{uuid}}.
