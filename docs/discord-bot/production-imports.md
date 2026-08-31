# Running import tools against production

See [Production hosting](production-hosting.md) for the other pages.

The `tools/import-*` importers write to the api-server hosted in-process by
the bot, and that server is not published to the internet. Reach it with a
private tunnel instead: `flyctl proxy` connects over Fly's WireGuard network
and forwards a local port to the machine, so nothing is ever exposed
publicly. This was chosen over publishing a TCP/HTTPS port (bearer-token auth
alone does not justify an unrestricted RPC surface on the open internet) and
over a persistent WireGuard peer via `flyctl wireguard create` (more standing
setup than an occasional, developer-initiated import run needs).

The tunnel listens on `localhost:3001` — deliberately not the `3000` the
local docker-compose stack binds, so a production import that runs for an
hour or more does not block local development in the meantime. An
importer's production `apiBaseUrl` is therefore `http://localhost:3001`,
while its local-development `apiBaseUrl` stays `http://localhost:3000`. The
bearer token differs too: production `apiToken` values come from the
`API_TOKEN_IMPORT_*` secrets in `apps/discord-bot/.env.production`, not from
the local `.env`.

Each importer therefore keeps a second, git-ignored config file next to its
default one:

| Tool                  | Local config                 | Production config                       |
| --------------------- | ---------------------------- | --------------------------------------- |
| `tools/import-bbl`    | `import-bbl-config.json5`    | `import-bbl-config.production.json5`    |
| `tools/import-tp`     | `import-tp-config.json5`     | `import-tp-config.production.json5`     |
| `tools/import-manual` | `import-manual-config.json5` | `import-manual-config.production.json5` |

Both variants share one committed template per tool — the existing
`import-*-config.example.json5`, copied twice — because the file shape is
identical and only the values differ. Setting `IMPORT_CONFIG_ENV=production`
for a run makes that tool read its `.production.json5` file; unset (or any
other value) reads the default one. This mirrors the
`.env` / `.env.production` split used for the bot itself.

To run an import against production:

1. Create the production config files once, from the same templates as the
   local ones:

   ```bash
   cp tools/import-bbl/import-bbl-config.example.json5 tools/import-bbl/import-bbl-config.production.json5
   cp tools/import-tp/import-tp-config.example.json5 tools/import-tp/import-tp-config.production.json5
   cp tools/import-manual/import-manual-config.example.json5 tools/import-manual/import-manual-config.production.json5
   ```

   Then edit each newly created file: fill in the production
   `connection.apiToken` value, **and** change `connection.apiBaseUrl` to
   `http://localhost:3001`. The shared template ships `http://localhost:3000`,
   which is correct for the local config but wrong for the production one —
   the tunnel listens on `3001`.
2. Build the tools:

   ```bash
   pnpm build
   ```

3. Open the tunnel in its own terminal, from the repository root where
   `fly.toml` lives, and leave it running:

   ```bash
   flyctl proxy 3001:3000
   ```

   `3001` is the local port the tunnel listens on; `3000` after the colon is
   the production machine's own listening port (see `fly.toml`), which is
   unrelated to this change and stays `3000`.
4. In a second terminal, run the importers in the same order the
   `deploy-local` skill uses locally — manual "before", BBL, TP, manual
   "after" — each from its own tool directory:

   ```bash
   ( cd tools/import-manual && IMPORT_CONFIG_ENV=production node dist/main.js data/before-other-importers )
   ( cd tools/import-bbl    && IMPORT_CONFIG_ENV=production node dist/main.js )
   ( cd tools/import-tp     && IMPORT_CONFIG_ENV=production node dist/main.js )
   ( cd tools/import-manual && IMPORT_CONFIG_ENV=production node dist/main.js data/after-other-importers )
   ```

5. Stop the tunnel (Ctrl-C) when the imports are done.

**If you already have `*-config.production.json5` files** from before the
tunnel moved to `3001`, they still point at `http://localhost:3000` and will
now write to your local stack (or fail to connect). Update `apiBaseUrl` to
`http://localhost:3001` in each of them by hand — they are git-ignored, so
no change to this repository can do it for you.

Common failures:

- **`ECONNREFUSED` on `localhost:3001`** — the tunnel is not running, or it
  died. Check the `flyctl proxy` terminal. A locally running docker-compose
  stack is not the cause: it binds `3000`, and the tunnel deliberately does
  not.
- **`401`** — the `apiToken` in the `.production.json5` file does not match
  the corresponding `API_TOKEN_IMPORT_*` secret pushed to Fly.
- **Wrong data imported** — `IMPORT_CONFIG_ENV` was not set (or was set in a
  different shell than the one that ran the tool), so the default config file
  was used.

The `deploy-production` skill automates this flow: it opens the tunnel,
runs the importers in the order above with `IMPORT_CONFIG_ENV=production`,
and closes the tunnel afterwards, in any combination of the four import
steps. It also checks first that nothing else holds port 3001, since another
production tunnel left running would stop this one from binding.

The manual steps above stay documented because they are what the skill does
under the hood — which is what you need when an automated run fails partway
through. Step 1 in particular stays a human job: the skill checks that the
`.production.json5` files exist and syncs them into a worktree, but never
creates one, because a config generated from the example template would
carry a placeholder token and fail with `401`.
