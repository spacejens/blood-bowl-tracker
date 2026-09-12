# `/debugfilterusage`

`/debugfilterusage` splits the Discord users the bot has recorded into two
groups: those who have supplied an optional ("filter") argument to a slash
command at least once, and those who have only ever invoked commands plain. It exists as a training and awareness
signal, not as moderation — a user who has never narrowed a command may
simply not know the bot can do it, and can be pointed at the capability.

It complements [`/debugtopusers`](debug-top-users.md), which reports _how
much_ a user interacts with the bot; this command reports _how_ they
interact with it.

The `debug` prefix on both the name and the description marks this as
maintainer tooling rather than a regular bot feature. It is a visibility
convention only: anyone who can see the command can run it. No permission
or role check restricts it, and no such mechanism exists elsewhere in the
bot.

## What counts as a filter

An argument counts as a filter when it is optional rather than required for
the command it belongs to. This is worked out from how each command is
actually defined today, not from a fixed list, so any current or future
optional argument is covered with no maintenance.

No argument anywhere in the bot is required today. Today that means this
classification covers literally any argument on any command that has one,
including `/deepdive`'s subject-selector arguments (`coach`, `team`,
`player`, and the rest): picking one of those is effectively how you use
the command, not "narrowing" in the everyday sense, but the classification
counts it as a filter all the same. This is a known and accepted
characteristic of the current command surface, not a bug — read the
"Plain only" list with that in mind for a command whose every option
happens to be a mandatory-in-practice selector.

A command could in principle require an argument, and such an argument
would never count as a filter — but, again, none does today.

## Arguments

- `days` — a whole number of days, at least 1. Considers only
  interactions that happened within that many days of now. Omitted, the
  report is all-time.

## The reply

One embed, titled `Filter usage`, with up to two headed sections:

```text
**Plain only**
- bob — 4 invocations
- dave — 1 invocation

**Uses filters**
- alice
- carol
```

`Plain only` comes first because it is the actionable list, and each row
carries how many filterable invocations that user made — the size of the
missed opportunity. Users tied on the same count are ordered by username,
so the ranking is stable rather than an arbitrary slice of a tie.

`Uses filters` is a flat alphabetical list: there is nothing to rank once
a user is known to have found the capability.

A section with no users is left out entirely rather than printed empty.

Neither list is capped and there is no pagination, matching
`/debugtopusers`' own reasoning for deferring it. A hard truncation
ending in `…` is applied to the assembled description as a safety net
against Discord's 4096-character embed limit.

When neither list has anyone in it — most plausibly a `days` window with
no activity in it — the reply is the plain message `No bot usage recorded
for those filters.` with no embed.

The reply is ephemeral, visible only to whoever ran the command: which
specific users do what is not public-channel content. See
[`/debuginteractions`](debug-interactions.md#ephemeral-by-design) for why
that applies to every `debug`-prefixed command. This command also appears
in `/debuginteractions`' own listing, so it can be
[retriggered](debug-interactions.md#retriggering-a-listed-interaction) —
and a retrigger's reply is public rather than ephemeral, the same
intentional exception described there.

## What is not counted

- **Commands with no optional arguments at all.** They offer no filter to
  discover, so their invocations are excluded from the report entirely. A
  user who has only ever run such commands has no awareness gap to flag
  and does not appear in either list.
- **Button clicks and select-menu selections.** Only slash-command
  invocations are considered: a component interaction has no analogous
  plain-versus-filtered shape.
- **Which** filter a user supplied, and what they set it to. Having ever
  used any one optional argument is enough to land in `Uses filters`; the
  report says nothing about which arguments a user has and has not
  discovered.
- **Invocations of a command that is no longer registered.** A renamed or
  removed command has no current definition to classify its recorded
  invocations against, so they are skipped.
- An interaction that matched no registered handler was never recorded at
  all, so it cannot appear here.
- **`debug`-prefixed commands' own invocations.** `/debugfilterusage`,
  `/debugtopusers`, and `/debuginteractions` are excluded from the report
  entirely, whether or not an optional option was supplied. Without this,
  a maintainer running one of these commands to check the bot would plant
  themselves in the "Plain only" bucket — self-usage of maintainer tooling
  is not a signal about regular bot usage.
