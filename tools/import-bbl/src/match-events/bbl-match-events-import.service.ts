import type {
  ActionType,
  ConsequenceType,
} from '@blood-bowl-tracker/api-contract';
import type {
  ImportError,
  ImportResult,
  UpsertCompetitionData,
  UpsertMatchEventData,
  UpsertTeamData,
} from '@blood-bowl-tracker/import';
import {
  makeImportError,
  makeImportResult,
  MatchEventsImportService,
  TeamsImportService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { BblMatchListReaderService } from '../matches/bbl-match-list-reader.service';
import type {
  BblEventSide,
  BblMatchEvents,
} from '../matches/match-events-page-parser';
import { BblMatchEventsReaderService } from './bbl-match-events-reader.service';

/** The category slug used in an event's synthesized external id, per action. */
const ACTION_CATEGORY: Record<ActionType, string> = {
  touchdown: 'td',
  completion: 'completion',
  interception: 'interception',
  deflection: 'deflection',
  foul: 'foul',
  mvp_award: 'mvp',
  casualty: 'cas',
  badly_hurt: 'badly-hurt',
  serious_injury: 'serious',
  death: 'death',
};

/** The category slug used in an event's synthesized external id, per consequence. */
const CONSEQUENCE_CATEGORY: Record<ConsequenceType, string> = {
  casualty: 'cas',
  badly_hurt: 'badly-hurt',
  serious_injury: 'serious',
  miss_next_game: 'miss-next-game',
  niggling_injury: 'niggling',
  stat_reduction_ma: 'stat-ma',
  stat_reduction_st: 'stat-st',
  stat_reduction_ag: 'stat-ag',
  stat_reduction_av: 'stat-av',
  death: 'death',
  sent_off: 'sent-off',
};

/**
 * A casualty-action severity and the Sustained-Injury consequences it may be
 * correlated with. A `badly_hurt` action only ever pairs with a `badly_hurt`
 * consequence; a `serious_injury` action pairs with any lasting-injury row; a
 * `death` action only pairs with a `death` consequence.
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
 * One match event to emit, in a form that is agnostic of DB ids. A merged
 * casualty event carries both an action and a consequence (with the acting
 * player on `actingSide` and the victim on `consequenceSide`); an action-only
 * event carries just the action side; a consequence-only event just the
 * consequence side.
 */
interface EmittedEvent {
  actionType?: ActionType;
  consequenceType?: ConsequenceType;
  actingSide?: BblEventSide;
  consequenceSide?: BblEventSide;
  actingPid?: string | null;
  consequencePid?: string | null;
}

function otherSide(side: BblEventSide): BblEventSide {
  return side === 'home' ? 'away' : 'home';
}

/**
 * Correlate one match's raw occurrences into events. Casualty action rows and
 * Sustained-Injury consequence rows are merged into a single event only when,
 * for a given acting side and severity group, there is exactly one action
 * candidate on that side and exactly one matching consequence candidate on the
 * opposing (victim) side. Everything else — including every ambiguous casualty
 * where two-or-more candidates exist — falls through to independent action-only
 * and consequence-only events, so no occurrence is ever dropped. Emission order
 * is merged events first, then leftover actions in occurrence order, then
 * leftover consequences in occurrence order; that order fixes the external-id
 * occurrence indices deterministically.
 */
function correlateEvents(events: BblMatchEvents): EmittedEvent[] {
  const actionConsumed = events.actions.map(() => false);
  const consequenceConsumed = events.consequences.map(() => false);
  const merged: EmittedEvent[] = [];

  for (const actingSide of ['home', 'away'] as const) {
    const victimSide = otherSide(actingSide);
    for (const group of SEVERITY_GROUPS) {
      const actionIndices = events.actions.flatMap((a, i) =>
        !actionConsumed[i] &&
        a.side === actingSide &&
        a.actionType === group.action
          ? [i]
          : [],
      );
      const consequenceIndices = events.consequences.flatMap((c, i) =>
        !consequenceConsumed[i] &&
        c.side === victimSide &&
        group.consequences.has(c.consequenceType)
          ? [i]
          : [],
      );
      if (actionIndices.length === 1 && consequenceIndices.length === 1) {
        const action = events.actions[actionIndices[0]];
        const consequence = events.consequences[consequenceIndices[0]];
        actionConsumed[actionIndices[0]] = true;
        consequenceConsumed[consequenceIndices[0]] = true;
        merged.push({
          actionType: action.actionType,
          consequenceType: consequence.consequenceType,
          actingSide,
          actingPid: action.pid,
          consequenceSide: victimSide,
          consequencePid: consequence.pid,
        });
      }
    }
  }

  const actionOnly: EmittedEvent[] = events.actions
    .filter((_, i) => !actionConsumed[i])
    .map((a) => ({
      actionType: a.actionType,
      actingSide: a.side,
      actingPid: a.pid,
    }));
  const consequenceOnly: EmittedEvent[] = events.consequences
    .filter((_, i) => !consequenceConsumed[i])
    .map((c) => ({
      consequenceType: c.consequenceType,
      consequenceSide: c.side,
      consequencePid: c.pid,
    }));

  return [...merged, ...actionOnly, ...consequenceOnly];
}

@Injectable()
export class BblMatchEventsImportService {
  constructor(
    private readonly matchListReader: BblMatchListReaderService,
    private readonly matchEventsReader: BblMatchEventsReaderService,
    private readonly teamsImport: TeamsImportService,
    private readonly matchEventsImport: MatchEventsImportService,
  ) {}

  /**
   * Import every match's events for every competition. For each completed match
   * (from the shared match-list reader) whose id was imported, this reads the
   * match's raw occurrences (from the shared events reader), resolves both
   * teams to their team-era ids under the competition's era, correlates
   * casualty actions with Sustained-Injury consequences (see
   * {@link correlateEvents}), synthesizes a stable external id per event
   * (`<matchBblId>-<teamCode>-<category>-<occurrenceIndex>` under the BBL
   * external system), resolves each player pid to its DB id, and upserts the
   * event. A match with no imported id, or whose two teams do not both resolve
   * to a team era, is recorded as an error and skipped without affecting the
   * rest. A pid with no imported id yields a null player (recorded as a
   * non-fatal error) but the event is still emitted, since the external id does
   * not depend on the player. Idempotent.
   */
  async importMatchEvents(
    competitionsByBblId: Map<string, UpsertCompetitionData>,
    teamsByCode: Map<string, UpsertTeamData>,
    matchIdsByBblId: Map<string, number>,
    playerIdsByPid: Map<string, number>,
  ): Promise<{ result: ImportResult }> {
    let imported = 0;
    const errors: ImportError[] = [];

    const matchesByCompetitionId =
      await this.matchListReader.getMatchesByCompetitionId(errors);
    const eventsByBblId =
      await this.matchEventsReader.getMatchEventsByBblId(errors);

    for (const [competitionBblId, competition] of competitionsByBblId) {
      const matches = matchesByCompetitionId.get(competitionBblId) ?? [];
      const externalSystemId = competition.externalIds[0].externalSystemId;
      // Team-era ids only depend on the competition's era, so memoize per
      // competition to avoid re-upserting a team shared across its matches.
      const teamEraIdByCode = new Map<string, number | undefined>();

      for (const match of matches) {
        try {
          const matchId = matchIdsByBblId.get(match.bblId);
          if (matchId === undefined) {
            errors.push(
              makeImportError({
                item: { competition: competition.name, match: match.bblId },
                message: `Skipping match events for match "${match.bblId}" in competition "${competition.name}": it has no imported match id.`,
              }),
            );
            continue;
          }

          const events = eventsByBblId.get(match.bblId);
          if (!events) {
            continue;
          }

          const homeTeamEraId = await this.resolveTeamEraId(
            events.homeTeamId,
            competition,
            teamsByCode,
            teamEraIdByCode,
            errors,
          );
          const awayTeamEraId = await this.resolveTeamEraId(
            events.awayTeamId,
            competition,
            teamsByCode,
            teamEraIdByCode,
            errors,
          );
          if (homeTeamEraId === undefined || awayTeamEraId === undefined) {
            errors.push(
              makeImportError({
                item: { competition: competition.name, match: match.bblId },
                message: `Skipping match events for match "${match.bblId}" in competition "${competition.name}": could not resolve both team eras.`,
              }),
            );
            continue;
          }

          imported += await this.emitEvents(
            events,
            matchId,
            externalSystemId,
            { home: homeTeamEraId, away: awayTeamEraId },
            playerIdsByPid,
            errors,
          );
        } catch (error) {
          errors.push(
            makeImportError({
              item: { competition: competition.name, match: match.bblId },
              message: `Failed to import events for match "${match.bblId}": ${
                error instanceof Error ? error.message : String(error)
              }`,
            }),
          );
        }
      }
    }

    return { result: makeImportResult({ imported, errors }) };
  }

  /**
   * Correlate and upsert every event for one match, synthesizing external ids
   * with per-(team, category) occurrence indices. Returns the number of events
   * whose upsert reported success.
   */
  private async emitEvents(
    events: BblMatchEvents,
    matchId: number,
    externalSystemId: number,
    teamEraIdBySide: Record<BblEventSide, number>,
    playerIdsByPid: Map<string, number>,
    errors: ImportError[],
  ): Promise<number> {
    const teamCodeBySide: Record<BblEventSide, string> = {
      home: events.homeTeamId,
      away: events.awayTeamId,
    };
    const occurrenceCounters = new Map<string, number>();
    let imported = 0;

    for (const event of correlateEvents(events)) {
      const hasAction = event.actionType !== undefined;
      const side = hasAction ? event.actingSide : event.consequenceSide;
      // Every emitted event has at least one side (it always has an action or a
      // consequence), so `side` is always defined here.
      const teamCode = teamCodeBySide[side as BblEventSide];
      const category = hasAction
        ? ACTION_CATEGORY[event.actionType as ActionType]
        : CONSEQUENCE_CATEGORY[event.consequenceType as ConsequenceType];

      const counterKey = `${teamCode}-${category}`;
      const occurrenceIndex = occurrenceCounters.get(counterKey) ?? 0;
      occurrenceCounters.set(counterKey, occurrenceIndex + 1);
      const externalId = `${events.bblId}-${teamCode}-${category}-${occurrenceIndex}`;

      const data: UpsertMatchEventData = {
        matchId,
        externalIds: [{ externalSystemId, externalId }],
      };
      if (event.actionType !== undefined) {
        data.actionType = event.actionType;
      }
      if (event.consequenceType !== undefined) {
        data.consequenceType = event.consequenceType;
      }
      if (event.actingSide !== undefined) {
        data.actingTeamEraId = teamEraIdBySide[event.actingSide];
      }
      if (event.consequenceSide !== undefined) {
        data.consequenceTeamEraId = teamEraIdBySide[event.consequenceSide];
      }
      const actingPlayerId = this.resolvePlayerId(
        event.actingPid,
        events.bblId,
        playerIdsByPid,
        errors,
      );
      if (actingPlayerId !== undefined) {
        data.actingPlayerId = actingPlayerId;
      }
      const consequencePlayerId = this.resolvePlayerId(
        event.consequencePid,
        events.bblId,
        playerIdsByPid,
        errors,
      );
      if (consequencePlayerId !== undefined) {
        data.consequencePlayerId = consequencePlayerId;
      }

      if (await this.matchEventsImport.upsertMatchEvent(data, errors)) {
        imported += 1;
      }
    }

    return imported;
  }

  /**
   * Resolve a team code to its team-era id under the competition's era,
   * upserting the team so the era is materialized. Memoized per competition via
   * `teamEraIdByCode`. An unknown code or a team that does not resolve to the
   * competition's era is recorded as an error and cached as `undefined`.
   */
  private async resolveTeamEraId(
    code: string,
    competition: UpsertCompetitionData,
    teamsByCode: Map<string, UpsertTeamData>,
    teamEraIdByCode: Map<string, number | undefined>,
    errors: ImportError[],
  ): Promise<number | undefined> {
    if (teamEraIdByCode.has(code)) {
      return teamEraIdByCode.get(code);
    }

    const team = teamsByCode.get(code);
    if (!team) {
      errors.push(
        makeImportError({
          item: { competition: competition.name, team: code },
          message: `Could not resolve team id "${code}" to an imported team while importing events for competition "${competition.name}".`,
        }),
      );
      teamEraIdByCode.set(code, undefined);
      return undefined;
    }

    const upsertedTeam = await this.teamsImport.upsertTeam(
      { ...team, eras: [competition.eraId] },
      errors,
    );
    const teamEra = upsertedTeam?.eras.find(
      (e) => e.eraId === competition.eraId,
    );
    teamEraIdByCode.set(code, teamEra?.id);
    return teamEra?.id;
  }

  /**
   * Resolve a player pid to its imported DB id. A null pid (an anonymous
   * occurrence) yields `undefined` silently; a non-null pid with no imported id
   * yields `undefined` and records a non-fatal error so the event is still
   * emitted with a null player.
   */
  private resolvePlayerId(
    pid: string | null | undefined,
    matchBblId: string,
    playerIdsByPid: Map<string, number>,
    errors: ImportError[],
  ): number | undefined {
    if (pid === null || pid === undefined) {
      return undefined;
    }
    const id = playerIdsByPid.get(pid);
    if (id === undefined) {
      errors.push(
        makeImportError({
          item: { match: matchBblId, pid },
          message: `Player pid "${pid}" in match "${matchBblId}" has no imported id; emitting the event with a null player.`,
        }),
      );
      return undefined;
    }
    return id;
  }
}
