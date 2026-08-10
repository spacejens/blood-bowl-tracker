---
name: deploy-production
description: Use to operate the blood-bowl-tracker production deployment on Fly.io and Neon — check deployment status, restart the machine, roll back to a previous release, trigger a redeploy of current main without a new merge, drop and recreate the production database, or run the manual/BBL/TP importers against production
---

# deploy-production

Operates the already-deployed production Discord bot described in `docs/discord-bot/production-hosting.md`: status and log inspection, machine restarts, rollbacks, on-demand redeploys, a destructive database reset, and the four production import runs. Every action here is a wrapper around commands that page already documents by hand — when an action fails, that page is the fallback.

This skill does **not** perform normal deploys. Those happen automatically in GitHub Actions on every merge to `main` (`.github/workflows/deploy.yml`); the closest thing offered here is dispatching that same workflow against the current `main`.

## Invocation

```
/deploy-production
```

Takes no arguments.

## Preconditions

These apply to every action below. Check them once, before step 0's question, and stop with a clear message if one fails — every action here is useless without them.

1. `flyctl` is installed and authenticated:
   ```bash
   fly auth whoami
   ```
   If this fails, tell the developer to run `flyctl auth login` themselves — it opens a browser for OAuth and needs a real interactive terminal, so this skill cannot do it for them.
2. `gh` is installed and authenticated (needed by the redeploy action, and harmless otherwise):
   ```bash
   gh auth status
   ```
3. Commands run from the repository root of the current checkout or worktree, where `fly.toml` lives. `fly.toml` is committed, so a worktree has it; the gitignored production files each action needs are synced by that action's own steps.

## Steps

0. Ask the developer which action(s) to perform. There are nine actions, and `AskUserQuestion` allows at most 4 options per question, so they are split across **three `multiSelect: true` questions sent in a single `AskUserQuestion` call** — the developer sees all three in sequence and answers once. Ask exactly these three questions, with exactly these options, in this order. Do not add, drop, reword, or reorder any option, and in particular do not add a "Both", "All", "None", or "Neither" option of your own invention — `multiSelect: true` already lets the developer pick any combination, including (by deselecting everything offered) none. See the `AskUserQuestion` option-ceiling and don't-invent-options rules in `CLAUDE.md`'s "Developer prompts" section for the rationale.

   All three questions are one decision split in three, so phrase them that way. The strings below are the `question` text; each also needs a short `header` of its own (`header` is capped at 12 characters, so the question text will not fit there) — e.g. `Run what`, `Run what 2`, `Run what 3`.

   **Question 1 — `question`: "Which action(s) should I run?"** (`multiSelect: true`):
   - **Check deployment status** — run `fly status` and a recent log tail, and summarize the machine's state.
   - **Restart the machine** — start a stopped machine, or restart a running one.
   - **Roll back to a previous release** — pick from Fly's release history and redeploy that image.

   **Question 2 — `question`: "Which action(s) should I run? (continued)"** (`multiSelect: true`):
   - **Trigger a redeploy without a new merge** — dispatch the GitHub Actions deploy workflow against the current `main`.
   - **Drop and recreate the production database** — DESTRUCTIVE: wipe the Neon schema and let the bot's startup migrations rebuild it.
   - **Run the manual import (before other importers) against production** — run `tools/import-manual/` against `data/before-other-importers` over a `flyctl proxy` tunnel.

   **Question 3 — `question`: "Which action(s) should I run? (continued)"** (`multiSelect: true`):
   - **Run the BBL import against production** — run `tools/import-bbl/` over a `flyctl proxy` tunnel.
   - **Run the TP import against production** — run `tools/import-tp/` over a `flyctl proxy` tunnel.
   - **Run the manual import (after other importers) against production** — run `tools/import-manual/` against `data/after-other-importers` over a `flyctl proxy` tunnel.

   The **union** of the three answers determines which sections below run; the split is purely a presentation constraint and carries no meaning of its own. The developer may select any combination of the nine options, including none. Sections run in the order they appear below, which is the order the options are listed above. No option is gated on any other: each section runs standalone if it is the only one picked. If the union is empty (nothing selected in any of the three questions), report "No action taken" and stop — this is a valid outcome, not an error.

## Non-goals

- **No normal deploys.** Merging to `main` deploys; this skill never runs `flyctl deploy` except as the mechanism of the rollback action, which deliberately deploys an *older* image.
- **No credential management.** The skill never runs `fly tokens create`, `gh secret set`, or `fly secrets import`. Creating the `FLY_API_TOKEN` secret and pushing `.env.production` to Fly stay manual, documented steps in `docs/discord-bot/production-hosting.md`.
- **No creating of gitignored production config.** `apps/discord-bot/.env.production` and the `tools/import-*/import-*-config.production.json5` files are authored once by a developer. This skill syncs them into a worktree and checks them, but never generates one from a template — same stance `deploy-local` takes on the local equivalents.
- **No backups.** There is no backup or restore of the Neon database; production data is reproducible by re-import, as `docs/discord-bot/production-hosting.md` documents.
- **No teardown.** The skill never stops or destroys the Fly machine or the Neon project.
