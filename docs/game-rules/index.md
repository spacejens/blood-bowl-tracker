# game-rules

`packages/game-rules` holds the pure Blood Bowl rules that both sides of the
API must apply the same way.

## Purpose

Some rules are needed both server-side, in `packages/game-data`, and
client-side, in tools such as `tools/import-manual-planner-cli`. Keeping one
implementation here means a rule change reaches both together.

## What it owns

- **Advancement candidates** — `AdvancementKindCandidatesService` works out
  which kinds of advancement a player's gained skills and characteristic
  increases could have been, given the position's skill access and the cost
  rows that apply under one rules set.
- **Spend range** — `AdvancementSpendRangeService` turns those candidates and
  the cost rows into the least and most SPP the advancements can have cost,
  and answers whether an exact spend is possible.
- **Reported pricing** — `ReportedAdvancementPricingService` prices
  advancements whose kind a report fixes (a TP feed report or a roster
  snapshot), the way the server's order check prices a fill.
- **Limits** — `MAX_DEDUCED`, the most new advancements whose orders are
  searched, and `FREE_EXTRA_SKILL_NAMES`, the skills gained as free extras
  that never take an advancement number.
- **Types** — the inputs and outputs of those services, such as
  `AdvancementCandidatesInput` and `SpendRange`.

Consumers: game-data uses the candidates, spend range, limits, lasting
reduction and incomplete-player gaps; import-manual-planner-cli uses reported
pricing, lasting reduction and the limits, and the gaps through game-data's
`INCOMPLETE_PLAYER_CRITERIA`. An agreement spec ties
reported pricing to the server's order check inside this package.

The package exports `GameRulesModule`, which provides and exports every
service. `packages/game-data` imports it through its `SppModule` and
re-exports the services, so its consumers keep their imports.

## Why it is shared

The planner tool and `packages/game-data` both price advancements, derive
lasting reductions and decide which players are incomplete. With one shared
implementation there is no second copy to keep in step, so no drift spec is
needed.

## Dependencies

Only `packages/domain-enums`, plus NestJS for the `@Injectable()` services. The
package does no I/O and touches no database, so both sides of the
client/server boundary can use it.

## Development

```bash
pnpm --filter @blood-bowl-tracker/game-rules run verify
pnpm --filter @blood-bowl-tracker/game-data run verify
```

Specs build each service through `Test.createTestingModule`, like every other
service in the repo.
