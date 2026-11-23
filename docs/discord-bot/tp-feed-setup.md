# TP notification feed setup

How to turn on the bot's [TP notification feed](tp-feed.md): the channel
settings, the bot's channel permissions and the Discord application setting
the feed needs.

## Configuration

Both channel variables are optional and are documented in
`apps/discord-bot/.env.example`.

- `TP_FEED_SOURCE_DISCORD_CHANNEL_ID` — the channel TP's integration posts into.
  Left unset, the bot does not listen for TP notifications at all and the
  feature is entirely off.
- `TP_FEED_DEBUG_DISCORD_CHANNEL_ID` — the channel the interpretations, the
  notices about notifications that did not parse, and failed imports are
  posted to. The player deepdive also posts a bug report here when a player
  killed in match events has a stored status that contradicts it, once per
  conflict per bot run (see
  [deepdive embeds](slash-commands/deepdive-embeds-player.md#status)). Left unset,
  notifications are still parsed and (while `TP_SCRAPING_ENABLED` is `true`)
  imported, and unrecognised shapes, failed imports and status conflicts are
  still logged, but nothing is posted. Because this is diagnostic output,
  point it at a maintainer channel rather than one real members read.

The feed's imports also obey the bot's mandatory `TP_SCRAPING_ENABLED` switch
(see [Configure the application](index.md#4-configure-the-application)).
Set to `false`, the bot still listens, parses notifications and echoes its
interpretation to the debug channel, but imports nothing and sends no request
to TP. Those notifications get no ✔️ reaction, since they were not imported;
after switching it back to `true`, running `/importtp` on the link of each
notification without a ✔️ brings them in.

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

Discord requires a review of this intent once an app reaches 10,000 unique
users across all its servers: the app must apply within 90 days of being
notified, and approved apps must reapply annually. Below that threshold it can
simply be switched on in the Developer Portal.
