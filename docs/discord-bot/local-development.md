# Local development bot identity

Local development uses its own Discord application, its own bot token, and
its own dev-only Discord server, kept entirely separate from the production
bot and the real server it posts to. This page explains why that separation
is necessary and how to set it up.

For the general Discord-side setup this page builds on, see
[the Discord Bot page](index.md). For the production deployment, see
[Production hosting](production-hosting.md).

## Why a second bot identity is needed

The production bot runs continuously on Fly.io (see
[Production hosting](production-hosting.md)). If a local instance logs in
with the same `DISCORD_BOT_TOKEN`, Discord treats both processes as the same
bot with two connected gateway sessions, and delivers every interaction —
slash commands, buttons, select menus — to both of them at once. Both
instances then try to answer the same interaction: whichever replies first
wins, the other's reply fails, and which one that is varies from one
interaction to the next. There is no way to tell Discord "only the local
session should handle this" while the two share a token, so the only
reliable fix that keeps the production bot running is a second application
with a token of its own.

A separate dev-only server matters for the same reason from the other
direction: even with its own token, a dev bot invited to the real server
posts its startup message and its scheduled random insights into channels
real coaches are reading, and its slash commands show up alongside the
production bot's. Keeping the dev bot in a server of its own means local
experiments — restarts, half-finished commands, a cron expression set to
fire every minute — stay invisible to everyone else, and the server itself
is free to be reconfigured or wiped at will.

## Setting it up

1. Create a **second** Discord application, following
   [Create a Discord application and bot](index.md#1-create-a-discord-application-and-bot).
   Give it a name that makes the distinction obvious in Discord's UI, such
   as `BloodBowlTracker-Dev`, and copy its own bot token.
2. Create a new Discord server for development only, separate from the
   production server. You create it in the Discord client itself (**+** in
   the server list > **Create My Own**); no particular structure is needed
   beyond at least one text channel the bot can post in.
3. Invite the second application to that dev-only server, following
   [Invite the bot to your server](index.md#2-invite-the-bot-to-your-server)
   — same scopes and permissions, but choose the dev server when
   authorizing. Do **not** invite the dev application to the production
   server.
4. Copy the channel ids from the dev server, following
   [Find the channel id](index.md#3-find-the-channel-id).

Because slash commands are registered globally per application (see
[Slash commands](index.md#slash-commands)), the freshly created dev
application takes up to about an hour to show its command definitions the
first time the bot starts — the same propagation delay `index.md` describes
for changes to an existing application, not something specific to a new one.

## Configuration

No new environment variables are involved. Switching identities is only a
matter of which values your local `apps/discord-bot/.env` holds, so configure
it exactly as
[Configure the application](index.md#4-configure-the-application) describes,
but with the dev application's and dev server's values:

- `DISCORD_BOT_TOKEN` — the second application's token, from step 1 above.
- `STARTUP_MESSAGE_DISCORD_CHANNEL` and `RANDOM_INSIGHTS_DISCORD_CHANNEL` —
  channel ids from the dev server, from step 4 above.

The remaining variables (`RANDOM_INSIGHTS_CRON`, the
`RANDOM_INSIGHTS_*_PROBABILITY` tunables, and the `API_TOKEN_IMPORT_*`
tokens) have nothing to do with bot identity and are set as usual for local
development.

`apps/discord-bot/.env` is git-ignored, and production values live in the
separate git-ignored `apps/discord-bot/.env.production` that is pushed to
Fly.io — so the two identities never share a file, and a local edit can never
reach production.

## Postgres is unaffected

Nothing about the database needs to change. Local development already runs
its own PostgreSQL container from `docker-compose.yml`, entirely separate
from the Neon database production uses, so local and production data are
already isolated regardless of which bot identity is configured.
