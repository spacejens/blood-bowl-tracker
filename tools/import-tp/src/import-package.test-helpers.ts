import {
  ImportResultService,
  NameExternalIdService,
} from '@blood-bowl-tracker/import';
import type { TpMatch, TpTournament } from '@blood-bowl-tracker/parse-tp';
import {
  MatchParserService,
  TournamentParserService,
} from '@blood-bowl-tracker/parse-tp';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

/**
 * A `MockProxy<ImportResultService>` wired to mirror the real (pure)
 * `ImportResultService`'s `error`/`result` construction (see
 * `packages/import/src/import-result.service.ts`), so specs that mock it
 * still exercise the caller's item/message/success-derivation behaviour
 * instead of asserting against opaque mock return values.
 */
export function mockImportResultService(): MockProxy<ImportResultService> {
  const importResults = mock<ImportResultService>();
  importResults.error.mockImplementation(({ item, message }) => ({
    item,
    message,
  }));
  importResults.result.mockImplementation(({ imported, errors }) => ({
    success: errors.length === 0,
    imported,
    errors,
  }));
  return importResults;
}

/**
 * A `MockProxy<NameExternalIdService>` wired to mirror the real (pure)
 * `NameExternalIdService`'s identity/template methods (see
 * `packages/import/src/name-external-id.service.ts`), so specs that mock it
 * still exercise the caller's exact-value-passed-through behaviour instead of
 * asserting against opaque mock return values.
 */
export function mockNameExternalIdService(): MockProxy<NameExternalIdService> {
  const nameExternalId = mock<NameExternalIdService>();
  nameExternalId.forCoach.mockImplementation((name) => name);
  nameExternalId.forEra.mockImplementation((name) => name);
  nameExternalId.forLeague.mockImplementation((name) => name);
  nameExternalId.forCompetition.mockImplementation((name) => name);
  nameExternalId.forRulesSet.mockImplementation((name) => name);
  nameExternalId.forTeam.mockImplementation((name) => name);
  nameExternalId.forRace.mockImplementation((name) => name);
  nameExternalId.forStarPosition.mockImplementation((name) => name);
  nameExternalId.forPosition.mockImplementation(
    (raceName, positionName) => `${raceName}: ${positionName}`,
  );
  return nameExternalId;
}

/**
 * A `MockProxy<TournamentParserService>` that treats each `TpSourceFile`'s
 * `content` as an already-parsed `TpTournament` (per the fixture, which
 * builds the typed shape directly), passing it through unchanged — except it
 * throws when `id`, `name` or `ruleSet` is missing, mirroring the one
 * validation rule these specs exercise without re-implementing the real Zod
 * schema. Full validation behaviour is covered by
 * `TournamentParserService`'s own dedicated spec in
 * `packages/parse-tp/src/tournament-parser.service.spec.ts`.
 */
export function mockTournamentParserService(): MockProxy<TournamentParserService> {
  const tournamentParser = mock<TournamentParserService>();
  tournamentParser.parse.mockImplementation((content) => {
    const tournament = content as Partial<TpTournament>;
    if (
      tournament.id === undefined ||
      tournament.name === undefined ||
      tournament.ruleSet === undefined
    ) {
      throw new Error(
        `Invalid TP tournament JSON: missing a required field ` +
          `(id/name/ruleSet) on ${JSON.stringify(tournament)}`,
      );
    }
    return tournament as TpTournament;
  });
  return tournamentParser;
}

/**
 * A `MockProxy<MatchParserService>` that treats each `TpSourceFile`'s
 * `content` as an already-parsed `TpMatch` (per the fixture, which builds the
 * typed shape directly), passing it through unchanged — except it throws when
 * `id` or `playedDate` is missing, mirroring the one validation rule these
 * specs exercise without re-implementing the real Zod schema and the nested
 * `MatchEventParserService`/`MatchEventDecodersService` chain. Full
 * validation behaviour is covered by `MatchParserService`'s own dedicated
 * spec in `packages/parse-tp/src/match-parser.service.spec.ts`.
 */
export function mockMatchParserService(): MockProxy<MatchParserService> {
  const matchParser = mock<MatchParserService>();
  matchParser.parse.mockImplementation((content) => {
    const match = content as Partial<TpMatch>;
    if (match.id === undefined || match.playedDate === undefined) {
      throw new Error(
        `Invalid TP match JSON: missing a required field (id/playedDate) ` +
          `on ${JSON.stringify(match)}`,
      );
    }
    return match as TpMatch;
  });
  return matchParser;
}

/**
 * Realigns a `vi.fn()` test double's static type to the exact function
 * signature a `MockProxy` method's `mockImplementation()` requires.
 *
 * `vi.fn()` called without an explicit generic parameter produces a
 * `Mock<Constructable | Procedure>`, whose intersection-typed call/construct
 * signatures are not structurally assignable to *any* concrete function
 * type (not even a generic `(...args: never[]) => unknown`) — TypeScript
 * needs an explicit escape hatch here, not a narrower structural type. Every
 * spec's `vi.fn()` double is still fully configured via
 * `mockResolvedValue`/`mockImplementation` at its own call site and behaves
 * correctly at runtime; this only realigns its *static* type, narrowly and
 * in one documented place, instead of scattering a bare `as X` cast through
 * each spec.
 */
export function asProviderMethod<F>(fn: unknown): F {
  return fn as F;
}
