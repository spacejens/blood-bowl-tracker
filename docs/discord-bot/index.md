# Discord Bot

The `apps/discord-bot` application connects to Discord using a bot account. On
launch it posts a random fact from a tree of tracked-data insights to a
configured channel, and it serves slash commands such as `/insights`. This
page explains how to set up the bot on the Discord side and how to configure
the application.

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
   **View Channel** for the target channel.
4. Copy the generated URL, open it in a browser, choose your server, and
   authorize. You need **Manage Server** permission on that server to add the
   bot.

## 3. Find the channel id

1. In Discord, open **User Settings > Advanced** and enable **Developer Mode**.
2. Right-click the channel you want the bot to post in and choose
   **Copy Channel ID**. This is your `DISCORD_CHANNEL_ID`.
3. Make sure the bot can see and post in that channel (channel permissions must
   allow the bot's role to View Channel, Send Messages, and Embed Links — the
   startup message is posted as a plain channel message, so it needs Embed
   Links whenever it's an embed, unlike slash-command replies).

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

On startup the bot logs in and posts a random fact drawn from `/insights` to
the configured channel. If the token or channel id is missing or invalid,
startup fails with an error in the logs (the bot is intentionally fail-fast
about misconfiguration).

## Slash commands

The bot registers these slash commands with every server it belongs to when it
starts (see each command's page for details); a server the bot joins later
receives the commands the next time it restarts. If the database does not respond
in time, a command falls back to the message `I am stunned` instead of its normal
reply, so it always answers within Discord's response window.

- [`/insights`](slash-commands/insights.md) — shares a random or chosen fact
  from a tree of categorized insights, with autocomplete to navigate the fact
  tree.
- [`/deepdive`](slash-commands/deepdive.md) — a lookup/drill-down command;
  currently shows a detail view for a single era (league, dates, rules sets,
  and its competitions in chronological order), reachable both directly and via
  the buttons on `/insights`' era list.
