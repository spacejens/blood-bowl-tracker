import type {
  ActionType,
  ConsequenceType,
  UpsertCompetition,
  UpsertTeam,
} from '@blood-bowl-tracker/api-contract';

import type {
  BblEventSide,
  BblMatchEvents,
} from '../matches/match-events-page-parser';
import type {
  CombinedOccurrences,
  EmittedEvent,
} from './match-event-correlation.service';

export const MATCH_BBL_ID = '89';
export const MATCH_DB_ID = 42;
export const HOME_TEAM_ERA_ID = 1000;
export const AWAY_TEAM_ERA_ID = 2000;
export const BBL_SYSTEM_ID = 1;

/**
 * Test-only helper. Do not import from production code.
 *
 * Fixture data shared across the match-events-import specs.
 */
export const competition: UpsertCompetition = {
  name: 'Major Season 3',
  type: 'season',
  eraId: 200,
  teamEraIds: [],
  externalIds: [{ externalSystemId: BBL_SYSTEM_ID, externalId: '3' }],
};

export const homeTeam: UpsertTeam = {
  name: 'Home',
  raceId: 70,
  coachId: 9,
  eras: [],
  externalIds: [],
};
export const awayTeam: UpsertTeam = {
  name: 'Away',
  raceId: 71,
  coachId: 10,
  eras: [],
  externalIds: [],
};

/**
 * Test-only helper. Do not import from production code.
 */
export function makeEvents(
  parts: Partial<
    Pick<BblMatchEvents, 'actions' | 'consequences' | 'journeymenCount'>
  >,
): BblMatchEvents {
  return {
    bblId: MATCH_BBL_ID,
    homeTeamId: 'hme',
    awayTeamId: 'awy',
    actions: parts.actions ?? [],
    consequences: parts.consequences ?? [],
    journeymenCount: parts.journeymenCount,
  };
}

/**
 * Test-only helper. Do not import from production code.
 *
 * The full upsertTeam result record (TeamsImportService.upsertTeam resolves
 * the API's Team + created shape). The subject under test only reads `.eras`,
 * so the other fields are unremarkable defaults.
 */
export function makeTeamRecord(eras: { id: number; eraId: number }[]) {
  return {
    id: 1,
    name: 'Team',
    raceId: 1,
    coachId: 1,
    eras,
    createdAt: new Date('2026-01-01'),
    created: true,
  };
}

/**
 * A casualty-action severity and the Sustained-Injury consequences it may be
 * correlated with. Mirrors the private SEVERITY_GROUPS table in
 * MatchEventCorrelationService (see match-event-correlation.service.ts) so
 * `correlateEventsLike` below reproduces its real, deterministic merging
 * behavior.
 */
const SEVERITY_GROUPS: {
  action: ActionType;
  consequences: ReadonlySet<ConsequenceType>;
}[] = [
  {
    action: 'badly_hurt',
    consequences: new Set<ConsequenceType>(['badly_hurt']),
  },
  {
    action: 'serious_injury',
    consequences: new Set<ConsequenceType>([
      'serious_injury',
      'miss_next_game',
      'niggling_injury',
      'stat_reduction_ma',
      'stat_reduction_st',
      'stat_reduction_ag',
      'stat_reduction_av',
    ]),
  },
  { action: 'death', consequences: new Set<ConsequenceType>(['death']) },
];

/**
 * Test-only helper. Do not import from production code.
 *
 * Mirrors MatchEventCorrelationService.combineOccurrences exactly (see
 * match-event-correlation.service.ts), so a regression in the service under
 * test (BblMatchEventsImportService) still fails these tests — the real
 * correlation behavior is exercised, just via a mocked provider instead of a
 * constructed instance. The correlation logic itself has its own dedicated
 * spec (match-event-correlation.service.spec.ts).
 */
export function combineOccurrencesLike(
  ...sources: BblMatchEvents[]
): CombinedOccurrences {
  const teamCodes: string[] = [];
  const actions: CombinedOccurrences['actions'] = [];
  const consequences: CombinedOccurrences['consequences'] = [];
  const journeymenSignings: CombinedOccurrences['journeymenSignings'] = [];

  for (const source of sources) {
    const codeBySide: Record<BblEventSide, string> = {
      home: source.homeTeamId,
      away: source.awayTeamId,
    };
    for (const code of [source.homeTeamId, source.awayTeamId]) {
      if (!teamCodes.includes(code)) {
        teamCodes.push(code);
      }
    }
    for (const a of source.actions) {
      actions.push({
        actionType: a.actionType,
        teamCode: codeBySide[a.side],
        pid: a.pid,
        sourceBblId: source.bblId,
      });
    }
    for (const c of source.consequences) {
      consequences.push({
        consequenceType: c.consequenceType,
        teamCode: codeBySide[c.side],
        pid: c.pid,
        sourceBblId: source.bblId,
      });
    }

    const journeymen = source.journeymenCount ?? { home: 0, away: 0 };
    for (const side of ['home', 'away'] as const) {
      if (journeymen[side] > 0) {
        journeymenSignings.push({
          teamCode: codeBySide[side],
          count: journeymen[side],
          sourceBblId: source.bblId,
        });
      }
    }
  }

  return { teamCodes, actions, consequences, journeymenSignings };
}

/**
 * Test-only helper. Do not import from production code.
 *
 * Mirrors MatchEventCorrelationService.correlateEvents exactly (see
 * match-event-correlation.service.ts). See combineOccurrencesLike above for
 * why this mirroring keeps the tests meaningful.
 */
export function correlateEventsLike(
  combined: CombinedOccurrences,
): EmittedEvent[] {
  const actionConsumed = combined.actions.map(() => false);
  const consequenceConsumed = combined.consequences.map(() => false);
  const merged: EmittedEvent[] = [];

  for (const actingTeamCode of combined.teamCodes) {
    for (const group of SEVERITY_GROUPS) {
      const actionIndices = combined.actions.flatMap((a, i) =>
        !actionConsumed[i] &&
        a.teamCode === actingTeamCode &&
        a.actionType === group.action
          ? [i]
          : [],
      );
      const consequenceIndices = combined.consequences.flatMap((c, i) =>
        !consequenceConsumed[i] &&
        c.teamCode !== actingTeamCode &&
        group.consequences.has(c.consequenceType)
          ? [i]
          : [],
      );
      if (actionIndices.length === 1 && consequenceIndices.length === 1) {
        const action = combined.actions[actionIndices[0]];
        const consequence = combined.consequences[consequenceIndices[0]];
        actionConsumed[actionIndices[0]] = true;
        consequenceConsumed[consequenceIndices[0]] = true;
        merged.push({
          actionType: action.actionType,
          consequenceType: consequence.consequenceType,
          actingTeamCode,
          actingSourceBblId: action.sourceBblId,
          actingPid: action.pid,
          consequenceTeamCode: consequence.teamCode,
          consequenceSourceBblId: consequence.sourceBblId,
          consequencePid: consequence.pid,
        });
      }
    }
  }

  const actionOnly: EmittedEvent[] = combined.actions
    .filter((_, i) => !actionConsumed[i])
    .map((a) => ({
      actionType: a.actionType,
      actingTeamCode: a.teamCode,
      actingSourceBblId: a.sourceBblId,
      actingPid: a.pid,
    }));
  const consequenceOnly: EmittedEvent[] = combined.consequences
    .filter((_, i) => !consequenceConsumed[i])
    .map((c) => ({
      consequenceType: c.consequenceType,
      consequenceTeamCode: c.teamCode,
      consequenceSourceBblId: c.sourceBblId,
      consequencePid: c.pid,
    }));

  const journeymanEvents: EmittedEvent[] = combined.journeymenSignings.map(
    (j) => ({
      actionType: 'journeymen_signings',
      actingTeamCode: j.teamCode,
      actingSourceBblId: j.sourceBblId,
      actingPid: null,
      journeymenCount: j.count,
    }),
  );

  return [...merged, ...actionOnly, ...consequenceOnly, ...journeymanEvents];
}
