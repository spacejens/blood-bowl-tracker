# TP notification feed

Blood Bowl leagues that run on [tourplay.net](https://tourplay.net) ("TP")
post their own notifications into a Discord channel through TP's Discord
integration. The bot can watch that channel, parse those notifications, and
echo a one-line interpretation of each into a second channel, so a maintainer
can confirm by eye that they are being read correctly.

Every notification the bot fully and successfully handles also gets a ✔️
reaction in the source channel — whether it was interpreted or deliberately
ignored. A message without the checkmark was never fully handled: the bot
was down when it arrived, posting its interpretation to the debug channel
failed, or the notification was not understood at all (reported as
unrecognised — see below). Unrecognised notifications never get the
checkmark, even when their debug-channel notice posts successfully.

## What is parsed

Five notification kinds are recognised and interpreted:

- Start of match
- End of match (draw and win, with the score)
- New skill/characteristic gained by a player
- Player hired
- Player fired

Two more are recognised and deliberately ignored, because they are out of
scope: match-scheduled notifications, and the in-match event notifications
(touchdown, casualty, MVP, foul, and so on) that all share a generic
`Match Event` embed author.

Anything else posted by a webhook with an embed in the source channel logs a
warning naming the message id and a short excerpt of the embed, and so does
any recognised notification whose fields do not parse. Both cases also post a
short `Unrecognized TP notification` line, linking back to the original
message, into the debug channel — TP can change its message format without
notice, and this is how that drift becomes visible without anyone watching
the server log. The log warning carries the detail; the debug post is the
heads-up that there is detail worth reading.

## What is imported

Each interpreted notification also triggers an import, through the same
in-process import code [`/importtp`](slash-commands/import-tp.md) uses:

| Notification                                   | Import                                          |
| ---------------------------------------------- | ----------------------------------------------- |
| End of match                                   | the match, as `/importtp` imports a match page  |
| Start of match                                 | both participating teams (not the match itself) |
| New skill/characteristic, player hired, fired  | the affected team, from its roster page link    |

Ignored and unrecognised notifications import nothing.

Imports run one at a time, in the order the notifications arrived, each
after a delay of about a second — TP can post a notification a moment
before its own page reflects it, and spacing the requests keeps them paced
like a person browsing rather than a burst hitting TP and the database at
once. A failed import never holds up the ones behind it.

Only real problems count as a failed import:

- a match that has not finished yet is expected at the start of a match and
  is not a failure there — but an end-of-match notification whose match TP
  still reports as not completed is;
- a notification whose link is not the expected TP match or roster page is;
- an import that ran but reported errors in any stage (the same
  "completed with errors" `/importtp` shows) is, and its errors are listed.

A failed import is always logged. When a debug channel is configured it is
also posted there as a short `TP import …` line keeping the notification's
link, followed by one line per error.

## Configuration

Both variables are optional and are documented in
`apps/discord-bot/.env.example`.

- `TP_FEED_SOURCE_DISCORD_CHANNEL` — the channel TP's integration posts into.
  Left unset, the bot does not listen for TP notifications at all and the
  feature is entirely off.
- `TP_FEED_DEBUG_DISCORD_CHANNEL` — the channel the interpretations, and the
  notices about notifications that did not parse, are posted to. Left unset,
  notifications are still parsed and unrecognised shapes are still logged, but
  nothing is posted. Because this is diagnostic output, point it at a
  maintainer channel rather than one real members read.

Copy both ids with Developer Mode enabled (User Settings > Advanced >
Developer Mode), by right-clicking the channel and choosing **Copy Channel
ID**. The bot needs **View Channel**, **Read Message History** and **Add
Reactions** on the source channel (the latter two for the ✔️ reaction), and
**View Channel** plus **Send Messages** on the debug channel. The bot must also
be a member of the guild where TP posts its notifications, which may not be the
same guild as the one its other features (startup/insights messages) operate
in.

## Discord application prerequisite

Reading another integration's message embeds needs the privileged **Message
Content Intent**, which cannot be enabled from this repository:

1. Open the [Discord Developer Portal](https://discord.com/developers/applications)
   and select the bot's application.
2. Open the **Bot** tab and scroll to **Privileged Gateway Intents**.
3. Enable **Message Content Intent** and save.

Without it, the bot fails to connect to Discord entirely — Discord rejects
the gateway connection with a disallowed-intent error — until this is
enabled, since the bot declares the matching gateway intents (`GuildMessages`
and `MessageContent`) itself, unconditionally, and the portal toggle is what
makes Discord allow them.

Discord requires verification for this intent once a bot reaches 100 servers.
Below that it can simply be switched on.
