# caress

Chatphrase Asynchronous Representational State Signaling

[![Build Status](https://travis-ci.org/chatphrase/caress.png?branch=master)](https://travis-ci.org/chatphrase/caress)

## Minimum requirements

Note that this system uses [Lua scripts][], and as such **requires at least
Redis 2.6** to run.

[Lua scripts]: http://redis.io/commands/eval

The Lua scripts as written do *not* use KEYS arguments to declare their
operated-on keys, and as such should be considered *not* Redis
Cluster-compatible.

## Configuration

Configuration for the database expects a "redis" object with "port" and
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

### Matched endpoints

#### message-list/{uuid}

The list of sent messages for the named unanswered offer.

#### match/{uuid}

The UUID the given UUID is connected to. Messages should be sent to
message-list/{uuid from match/{uuid}}.
