# First-time setup

See [Production hosting](production-hosting.md) for the other pages.

Done once, by a developer with accounts on both providers:

1. Install `flyctl` and sign in:

   ```bash
   flyctl auth login
   ```

   (`flyctl auth signup` if you do not have a Fly account yet.) This opens a
   browser for OAuth, so it needs a real interactive terminal — it does not
   work from a non-interactive/headless shell.
2. Sign up for Neon, create a project named `blood-bowl-tracker` in region
   `eu-central-1`, and copy its **direct** connection string.
3. Fly requires billing info on file before it will create apps, even at
   this low usage tier. Add a card at
   `https://fly.io/dashboard/<your-org>/billing` if you have not already.
   Then create the Fly app:

   ```bash
   flyctl apps create blood-bowl-tracker-discord-bot
   ```

4. Scale to two machines:

   ```bash
   fly scale count 2
   ```

   Machine count is not a `fly.toml` field — like `flyctl apps create`, it is
   set imperatively, once. Deploys preserve the existing count, so this does
   not need repeating. See [Active and standby](production-topology.md#active-and-standby) for what
   the second machine does.
5. Create `apps/discord-bot/.env.production` and fill in every variable:
   the production `DISCORD_BOT_TOKEN`, the production channel ids, the
   `RANDOM_INSIGHTS_*` tunables, the `API_TOKEN_IMPORT_*` tokens, and
   `DATABASE_URL` set to the Neon string from step 2.
6. Push secrets and deploy:

   ```bash
   fly secrets import < apps/discord-bot/.env.production
   fly deploy
   ```

7. Create a Fly deploy token and store it as a GitHub Actions repository
   secret, so the deploy workflow can authenticate. Run from the repository
   root, where `fly.toml` names the app:

   ```bash
   fly tokens create deploy --name github-actions
   gh secret set FLY_API_TOKEN --app actions
   ```

   `fly tokens create deploy` prints the token on stdout; the leading
   `FlyV1` followed by a space is part of the value, so paste the whole line
   when `gh secret set` prompts for it. The token is scoped to deploying this
   one app, not
   to the whole Fly account. Adding the secret through the GitHub web UI
   (Settings → Secrets and variables → Actions) works equally well.

   This step stays manual on purpose. The `deploy-production` skill does not
   mint or store this credential: creating a deploy token is a rare,
   deliberate act, and a skill that did it silently would be handing itself
   the ability to deploy.

8. Verify — see [Checking on the deployment](production-monitoring.md).
