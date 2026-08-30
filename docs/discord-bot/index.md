# Discord Bot

The `apps/discord-bot` application connects to Discord using a bot account. On
launch it posts a deployment status message to a configured channel, it posts
scheduled random facts from a tree of tracked-data insights on a cron
schedule, and it serves slash commands such as `/insights`. This page
explains how to set up the bot on the Discord side and how to configure the
application.

## 1. Create a Discord application and bot

1. Sign in to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Click **New Application**, give it a name, and create it.
3. Open the **Bot** tab. The application already has a bot user attached.
4. Under **Token**, click **Reset Token** and copy the value. This is your
   `DISCORD_BOT_TOKEN`. Treat it like a password — anyone with it can control
   your bot. If it leaks, reset it here to invalidate the old one.

## 2. Invite the bot to your server

1. Open the **OAuth2 > URL Generator** tab.
2. Under **Scopes**, select `bot` and `applications.commands`. The
   `applications.commands` scope is required for the bot's slash commands
   (e.g. `/insights`) to register.
3. Under **Bot Permissions**, select at least **Send Messages**, **Embed
   Links** (the startup message and most `/insights` facts are embeds), and
   **View Channel** for the target channels.
4. Copy the generated URL, open it in a browser, choose your server, and
   authorize. You need **Manage Server** permission on that server to add the
   bot.

## 3. Find the channel id

1. In Discord, open **User Settings > Advanced** and enable **Developer Mode**.
2. Right-click the channel you want the bot to post its startup message in and
   choose **Copy Channel ID**. This is your `STARTUP_MESSAGE_DISCORD_CHANNEL`.
3. Do the same for the channel the scheduled random insights should go to, to
   get `RANDOM_INSIGHTS_DISCORD_CHANNEL`. Once the bot is serving real server
   members, these should be two different channels: the startup message is
   status output for whoever runs the bot, while the scheduled insights are
   the bot's regular output for everyone. Give the insights channel a name
   that signals it carries the bot's automated posts rather than conversation
   — something along the lines of `bot-updates` or `tracker-insights` — so
   members know what to expect there. Pointing both variables at the same test
   channel is fine for purely local development.
4. Make sure the bot can see and post in those channels (channel permissions
   must allow the bot's role to View Channel, Send Messages, and Embed Links —
   both the startup message and the scheduled insights are posted as plain
   channel messages, not slash-command replies, so they need Embed Links
   rather than relying on Discord's own interaction-response handling).

## 4. Configure the application

Configuration is supplied through an environment file in the app directory.

1. Copy the template:
   ```bash
   cp apps/discord-bot/.env.example apps/discord-bot/.env
   ```
2. Edit `apps/discord-bot/.env` and set:
   - `DISCORD_BOT_TOKEN` — the token from step 1.
   - `STARTUP_MESSAGE_DISCORD_CHANNEL` — the channel id from section 3. The
     bot posts a deployment status message here on every startup.
   - `RANDOM_INSIGHTS_CRON` — when the bot posts a scheduled random insight,
     as a standard 5-field cron expression (an optional sixth leading field is
     seconds), in the bot process's local time zone (in the Docker deployment
     this is UTC unless `TZ` is set). `0 * * * *` posts hourly. An invalid
     expression makes the bot fail to start. The hourly example exists for
     local testing, where fast feedback while developing matters; a channel
     serving real members generally wants a far lower frequency, such as once
     a day (`0 8 * * *`).
   - `RANDOM_INSIGHTS_DISCORD_CHANNEL` — the channel the scheduled random
     insights are posted to, from section 3. Once the bot is released to real
     members this is its own dedicated channel, separate from the startup
     channel.
   - `RANDOM_INSIGHTS_FILTER_PROBABILITY` — percent chance (integer 0-100)
     that a scheduled insight is scoped to one randomly chosen era or
     competition instead of being unfiltered. The template's value is a
     starting point picked for local testing.
   - `RANDOM_INSIGHTS_FILTER_CURRENT_ERA_PROBABILITY` — percent chance
     (integer 0-100) that an era- or competition-scoped insight draws only
     from ongoing eras (those with no end date). Like
     `RANDOM_INSIGHTS_FILTER_PROBABILITY`, the template's value is a
     local-testing starting point; how varied the posts in a live channel
     should feel is worth deciding deliberately for that audience.
   - `API_TOKEN_IMPORT_BBL`, `API_TOKEN_IMPORT_TP`, `API_TOKEN_IMPORT_MANUAL`
     — the bearer tokens the API accepts on `/rpc`, one per importer tool
     (`tools/import-bbl`, `tools/import-tp`, `tools/import-manual`). Any
     hard-to-guess string works for local development; each must match the
     `connection.apiToken` in that tool's `import-*-config.json5`. A request
     with no token, or one matching none of these, is rejected with `401`.
     Leaving a variable empty disables that caller.

`apps/discord-bot/.env` is git-ignored, so your secrets are never committed.
Docker Compose loads this file via the `env_file` entry for the `discord-bot`
service.

## 5. Run it

With Docker Compose:

```bash
docker compose up discord-bot
```

On startup the bot logs in and posts a deployment status message to
`STARTUP_MESSAGE_DISCORD_CHANNEL`. If a required token or channel id is
missing or invalid, startup fails with an error in the logs (the bot is
intentionally fail-fast about misconfiguration).

For the production deployment — the Fly.io app, the Neon database, and how
production configuration and secrets get there — see
[Production hosting](production-hosting.md).

For local development alongside the always-on production bot — why a local
instance needs its own Discord application and its own dev-only server, and
how to set them up — see
[Local development bot identity](local-development.md).

## Slash commands

The bot registers these slash commands globally rather than per server, so they
work both in every server the bot belongs to and in a direct message to the bot
(see each command's page for details), though DM use still requires the user to
share a server with the bot — this is the guild-install model, not a broader
user-install. If the database does not respond in time,
a command falls back to the message `I am stunned` instead of its normal reply,
so it always answers within Discord's response window.

Global registration is what makes DM use possible, and it trades away the
near-instant propagation that per-server registration had. After a deploy that
changes what a command *looks* like — its name, description, or options —
Discord can take up to about an hour to show the new definition, and the old
definition keeps working in the meantime. An unchanged `/insights` or
`/deepdive` listing shortly after such a deploy is normal, not a sign the deploy
failed. The delay only applies to changes in what the bot sends to Discord at
startup; a deploy that only changes how a command answers (handler logic) takes
effect immediately.

- [`/insights`](slash-commands/insights.md) — shares a random or chosen fact
  from a tree of categorized insights, with autocomplete to navigate the fact
  tree.
- [`/deepdive`](slash-commands/deepdive.md) — a lookup/drill-down command;
  currently shows a detail view for a single era (league, dates, rules sets,
  and its competitions in chronological order), a single coach (career span
  and top teams), or a single team (race, coach, career span, and top players
  by match events), reachable both directly and via the buttons on `/insights`'
  era list, coach toplists, and team toplists.
- [`/onthisdate`](slash-commands/on-this-date.md) — what happened on one
  calendar date across every recorded year.

### Drill-down buttons and blank entity names

Every drill-down button and select-menu option (from both `/insights` and
`/deepdive`) is built in one place, `EntityComponentsService` in
`apps/discord-bot/src/entity-components.service.ts`, because Discord rejects
a component with an empty `label` outright — failing the whole interaction.
Some imported entities (players, so far) genuinely have a blank name in the
source data, so the service substitutes a placeholder whenever a label is
empty or whitespace-only.

That placeholder is a **zero-width space** (`U+200B`), not the more obvious
non-breaking space (`U+00A0`): Discord's API rejects an NBSP-only label with
a `400 BASE_TYPE_REQUIRED` error, treating it as blank the same as `''` —
confirmed against the live API while fixing #350, after it passed code
review and every unit test with NBSP. A zero-width space isn't normalized
away the same way and is accepted, while still rendering visually blank.
Any future case needing a Discord text field that must be non-empty but
visually blank should use the same character, and should be confirmed
against a live bot before trusting a "should be valid" assumption about
Discord's validation.
