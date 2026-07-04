# Spec Conventions

Specifications in this project describe **why** things are the way they are and **what** the rules are — not how they are implemented. The code is the authoritative source for implementation details (data structures, enum values, API contracts).

Start here: [glossary.md](glossary.md)

## Directory structure

```
docs/
  glossary.md              # Brief definition of every named concept
  spec-conventions.md      # This file
  game-concepts/           # Blood Bowl domain concepts
    teams/
    players/
    ...
  insights/                # Statistics, top lists, and other derived or human-submitted content
  api/                     # General API concepts (REST conventions, imports); not per-entity docs
  discord-bot/             # Discord bot app specs
  <future-app>/            # Future apps get their own top-level subfolder
```

`game-concepts/` is the parent for all domain entities. Each app gets its own top-level subfolder. `insights/` covers anything derived from collected data or submitted by users — the term is intentionally broad to cover both objective stats and subjective content.

## Glossary

`docs/glossary.md` defines every named concept relevant to the project — both standard Blood Bowl terms and custom/invented terminology. Each entry uses a `## Term` heading so other files can link to it:

```markdown
[Team](../glossary.md#team)
```

The glossary contains brief definitions (one paragraph or less). Deeper explanation belongs in a domain spec.

## Spec file conventions

Each spec file should:

- **Open with a one-sentence purpose statement** — what this concept or feature is for
- **Define or reference terms** — link to `glossary.md` for central terms; define inline if introducing something new (and add it to the glossary separately)
- **State rules and constraints** — domain invariants the code must respect but doesn't explain on its own (e.g. "a team may not have more than 16 players on its roster")
- **Record decisions and rationale** — the *why* behind non-obvious design choices
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
