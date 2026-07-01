# Discord Bot

The `apps/discord-bot` application connects to Discord using a bot account. On
launch it posts a summary of the tracked data to a configured channel, and it
serves slash commands such as `/stats`. This page explains how to set up the bot
on the Discord side and how to configure the application.

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
   (e.g. `/stats`) to register.
3. Under **Bot Permissions**, select at least **Send Messages** (and **View
   Channel** for the target channel).
4. Copy the generated URL, open it in a browser, choose your server, and
   authorize. You need **Manage Server** permission on that server to add the
   bot.

## 3. Find the channel id

1. In Discord, open **User Settings > Advanced** and enable **Developer Mode**.
2. Right-click the channel you want the bot to post in and choose
   **Copy Channel ID**. This is your `DISCORD_CHANNEL_ID`.
3. Make sure the bot can see and post in that channel (channel permissions must
   allow the bot's role to View Channel and Send Messages).

## 4. Configure the application

Configuration is supplied through an environment file in the app directory.

1. Copy the template:
   ```bash
   cp apps/discord-bot/.env.example apps/discord-bot/.env
   ```
2. Edit `apps/discord-bot/.env` and set:
   - `DISCORD_BOT_TOKEN` — the token from step 1.
   - `DISCORD_CHANNEL_ID` — the channel id from step 3.

`apps/discord-bot/.env` is git-ignored, so your secrets are never committed.
Docker Compose loads this file via the `env_file` entry for the `discord-bot`
service.

## 5. Run it

With Docker Compose:

```bash
docker compose up discord-bot
```

On startup the bot logs in and posts a summary of the tracked data (the same
message the [`/stats`](#slash-commands) command returns) to the configured
channel. If the token or channel id is missing or invalid, startup fails with an
error in the logs (the bot is intentionally fail-fast about misconfiguration).

## Slash commands

The bot registers these slash commands with every server it belongs to (see each
command's page for details):

- [`/stats`](slash-commands/stats.md) — posts a summary of how many coaches,
  teams, matches, and competitions have been recorded.
