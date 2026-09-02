# Spec Conventions

Specifications in this project describe **why** things are the way they are and **what** the rules are — not how they are implemented. The code is the authoritative source for implementation details (data structures, enum values, API contracts).

Start here: [glossary.md](glossary.md)

## Directory structure

```text
docs/
  glossary.md              # Docs-about-docs: brief definition of every named concept
  spec-conventions.md      # Docs-about-docs: this file
  architecture.md          # Repo-meta: technical stack and package structure
  development-workflow.md  # Repo-meta: how development work is structured
  game-concepts/           # Spec style: Blood Bowl domain concepts
    teams/
    players/
    ...
  insights/                # Spec style: statistics, top lists, and other derived or human-submitted content
  api/                     # Spec style: general API concepts (RPC conventions, imports); not per-entity docs
  discord-bot/             # Spec style: Discord bot app specs (with how-to exceptions, see below)
  <future-app>/            # Spec style: future apps get their own top-level subfolder
  dev-workflow-cli/        # Tool/how-to: developer/PR workflow CLI used by Claude Code skills
  production-ops-cli/      # Tool/how-to: production database and tunnel operations CLI
  fs-utils-cli/            # Tool/how-to: worktree-aware filesystem helper CLI
  download-tp/             # Tool/how-to: TP data downloader
  import-bbl/              # Tool/how-to: BBL data importer
  import-manual/           # Tool/how-to: hand-authored data importer
  import-tp/               # Tool/how-to: TP data importer
  review-match/            # Tool/how-to: match-data review aid
  review-player/           # Tool/how-to: player-data review aid
  review-race/             # Tool/how-to: race- and position-data review aid
```

`game-concepts/` is the parent for all domain entities. Each app gets its own top-level subfolder. `insights/` covers anything derived from collected data or submitted by users — the term is intentionally broad to cover both objective stats and subjective content.

## Doc styles

Besides `glossary.md` and this file — tagged `Docs-about-docs` above, since they describe the docs themselves rather than fitting one of the three styles below — `docs/` holds three kinds of document, and different expectations apply to each:

- **Spec docs** — `game-concepts/`, `insights/`, `api/`, `discord-bot/`, and future app subfolders. These are governed by [Spec file conventions](#spec-file-conventions) below: describe why and what, and leave implementation detail to the code.
- **Tool/how-to docs** — `dev-workflow-cli/`, `production-ops-cli/`, `fs-utils-cli/`, `download-tp/`, `import-bbl/`, `import-manual/`, `import-tp/`, `review-match/`, `review-player/`, `review-race/`. These document how to configure, run, and operate a tool. Implementation detail — configuration schemas, CLI flags, file formats, setup and deployment steps — is expected and appropriate here, not something to omit.
- **Repo-meta docs** — `architecture.md` and `development-workflow.md`. These describe the project's own technical stack, structure, and development process. No fixed rule set applies; follow the existing style of each file.

One accepted exception: `discord-bot/index.md`, `discord-bot/local-development.md`, and `discord-bot/production-hosting.md` — together with the `discord-bot/production-*.md` pages it indexes — are how-to content (Discord app creation, local development, Fly.io/Neon hosting) inside a spec-style folder. That is intentional, not a violation of the spec-style categorization — the folder's conceptual specs are its `slash-commands/*.md` files.

The directory map above covers checked-in doc areas only. Gitignored, generated areas — `plans/` (this workflow's working files) and `schemaspy-output/` (the database diagram produced by `pnpm run db:diagram`) — are absent by design, not omissions.

## Glossary

`docs/glossary.md` defines every named concept relevant to the project — both standard Blood Bowl terms and custom/invented terminology. Each entry uses a `## Term` heading so other files can link to it:

```markdown
[Team](../glossary.md#team)
```

The glossary contains brief definitions (one paragraph or less). Deeper explanation belongs in a domain spec.

## Spec file conventions

These conventions apply to spec-style docs as categorized under [Doc styles](#doc-styles) above — not to tool/how-to docs or repo-meta docs.

Each spec file should:

- **Open with a one-sentence purpose statement** — what this concept or feature is for
- **Define or reference terms** — link to `glossary.md` for central terms; define inline if introducing something new (and add it to the glossary separately)
- **State rules and constraints** — domain invariants the code must respect but doesn't explain on its own (e.g. "a team may not have more than 16 players on its roster")
- **Record decisions and rationale** — the _why_ behind non-obvious design choices
- **Reference code directly when appropriate** — e.g. "see `src/teams/team.entity.ts`" instead of duplicating what the code already expresses

Specs deliberately omit:

- Enum values, field names, data structures — live in code
- API contracts between modules — enforced by compiler and tests
- Step-by-step implementation details

No required section headings. A simple concept may need only a purpose sentence and a few bullet rules. A complex feature area may warrant headings for Background, Rules, Decisions, and Open Questions.

Cross-references use relative markdown links:

```markdown
[roster rules](../teams/roster.md)
[Drive](../glossary.md#drive)
```
