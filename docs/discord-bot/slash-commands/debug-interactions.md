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

- The row number (1–20, with a matching retrigger button below). The time it
  happened, as Discord's native timestamp markdown, so every viewer sees it in
  their own locale and timezone.
- Who triggered it and where: the Discord username, followed by the guild
  name and channel name (`coach42 in Test League #general`), or `a DM` in
  place of the guild name when the interaction happened outside any guild
  (`coach42 in a DM`). The channel name is omitted when the channel has none,
  which is common for DMs.
- What was triggered: the slash command as `/name`, or a component as
  `button name` or `select_menu name`, where the name is the recorded
  customId prefix.
- The recorded parameters, as `key: value` pairs in the order they were
  recorded, comma-separated in parentheses. Every autocomplete-backed
  option (`race`, `era`, `league`, `competition`, `competition-group`,
  `coach`, `team`, `player`, `star-player`, `position`, `trophy`) records
  the entity's database id as its value, so those are looked up and shown
  as the entity's name instead — `race: Orc`, not `race: 17`. The lookup
  is best-effort: an option with no entity behind it, a value that is not
  an id, and an entity deleted since the interaction was recorded all fall
  back to the raw recorded value. A parameter recorded with no value shows
  as `key: <empty>`; a repeated key (a multi-select's several values) is
  repeated rather than grouped. An interaction with no parameters gets no
  parentheses at all.
- The outcome, as a tick for a success or a cross for a failure, followed
  by the recorded error message when there is one — a failure is not
  guaranteed to carry one.

Twenty rows is a fixed cap, not an argument: it keeps the description
comfortably inside Discord's 4096-character embed limit in the common case.
Recorded error messages and parameter values are unbounded text, though, so
a hard truncation (ending in `…`) is applied as an absolute safety net for
the rare case of very long ones. When nothing matches, the reply is the
plain message `No matching interactions found.` with no embed.

## Retriggering a listed interaction

Below the embed sits one button per listed row, labelled with that row's
number. Clicking button 3 re-runs whatever row 3 describes: the same slash
command with the same option values, or the same button or select-menu
interaction with the same selection.

The retriggered handler is invoked directly rather than through the bot's
normal interaction dispatcher. That works because no command or component
handler in this bot reads anything about _who_ triggered it or _where_ —
replying, logging and usage recording all live in the dispatcher — so a
minimal stand-in carrying just the recorded options (or customId and
selected values) is enough. Recorded option values are passed through
faithfully, including a `user` filter recorded for `/debuginteractions`
itself: the recorded snowflake is handed back through the stand-in's
`getUser`, so retriggering a filtered listing reproduces the same filter
rather than silently showing everyone's history.

Two consequences follow from going around the dispatcher:

- The retriggered run records no `discord_bot_usage` row of its own, so
  retriggering never pollutes the very history this command reads. The
  button click itself is recorded like any other button interaction — as
  kind `button`, name `debug:retrigger:` — so it will itself show up in the
  next `/debuginteractions` listing, with its own retrigger button. Clicking
  that re-runs the original retriggered interaction one level removed; an
  event can never reference a click that postdates it, so this can't loop
  forever, but it's worth recognizing these rows for what they are.
- The reply lands in the channel where the retrigger was clicked, not in
  the channel the original interaction happened in, and it is public
  rather than ephemeral — the same way that command or component would
  normally answer. Retriggering something in a public channel therefore
  posts its answer there for everyone.

Two things can go wrong, and both answer with a plain ephemeral message
rather than failing:

- The recorded interaction is no longer in the database.
- The command, button or select menu has been renamed or removed since it
  was recorded, so nothing is registered to handle it any more.

An entity referenced by a recorded parameter that has since been deleted
needs no special handling here: the retriggered command answers with its
own not-found message, exactly as it would for a live invocation.

## Ephemeral by design

`debug`-prefixed commands reply ephemerally by design — visible only to
whoever ran them. `/debuginteractions` is the first to exist, but the
rule is about the `debug` prefix, not this command specifically. The
reply can surface another user's interaction history and internal error
messages, neither of which belongs in a public channel. Every
non-`debug`-prefixed command replies publicly.
