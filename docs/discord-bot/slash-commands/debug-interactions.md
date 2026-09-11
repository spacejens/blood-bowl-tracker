# `/debuginteractions`

`/debuginteractions` lists the most recent bot interactions the
`discord_bot_usage` schema has recorded — what was triggered, when, with
which parameters, and whether the handler succeeded. It exists for
answering "it failed for me" without direct database access.

The `debug` prefix on both the name and the description marks this as
maintainer tooling rather than a regular bot feature. It is a visibility
convention only: anyone who can see the command can run it. No permission
or role check restricts it, and no such mechanism exists elsewhere in the
bot.

## Arguments

Both arguments are optional, and they combine — a user plus an outcome
narrows to that user's successes or failures alone.

- `user` — Discord's own user picker. Narrows to interactions by that
  Discord user, matched on the recorded `discord_id`.
- `outcome` — a choice of `Success` or `Failure`, matching the recorded
  outcome.

There is no guild-scoping argument. Recorded interactions are not always
tied to a guild — a direct message belongs to none — and someone
diagnosing a report wants the full recent history wherever it happened.

## The reply

One embed, titled `Recent interactions`, listing up to the 20 most recent
matching interactions, newest first. Each row carries, in order:

- The time it happened, as Discord's native timestamp markdown, so every
  viewer sees it in their own locale and timezone.
- What was triggered: the slash command as `/name`, or a component as
  `button name` or `select_menu name`, where the name is the recorded
  customId prefix.
- The recorded parameters, as `key: value` pairs in the order they were
  recorded, comma-separated in parentheses. A parameter recorded with no
  value shows as `key: <empty>`; a repeated key (a multi-select's several
  values) is repeated rather than grouped. An interaction with no
  parameters gets no parentheses at all.
- The outcome, as a tick for a success or a cross for a failure, followed
  by the recorded error message when there is one — a failure is not
  guaranteed to carry one.

Twenty rows is a fixed cap, not an argument: it keeps the description
comfortably inside Discord's 4096-character embed limit in the common case.
Recorded error messages and parameter values are unbounded text, though, so
a hard truncation (ending in `…`) is applied as an absolute safety net for
the rare case of very long ones. When nothing matches, the reply is the
plain message `No matching interactions found.` with no embed.

## Ephemeral by design

`debug`-prefixed commands reply ephemerally by design — visible only to
whoever ran them. `/debuginteractions` is the first to exist, but the
rule is about the `debug` prefix, not this command specifically. The
reply can surface another user's interaction history and internal error
messages, neither of which belongs in a public channel. Every
non-`debug`-prefixed command replies publicly.
