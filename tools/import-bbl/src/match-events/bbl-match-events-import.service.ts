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
import { MatchMergeService } from '../matches/match-merge.service';
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

/** One casualty/achievement occurrence tagged with its team code and source match. */
interface TeamCodedAction {
  actionType: ActionType;
  teamCode: string;
  pid: string | null;
  sourceBblId: string;
}
interface TeamCodedConsequence {
  consequenceType: ConsequenceType;
  teamCode: string;
  pid: string | null;
  sourceBblId: string;
}
/**
 * The combined occurrences of one match (2 team codes) or a merged pair
 * (4 team codes), each occurrence tagged with the code of the team it belongs
 * to and the source match it came from.
 */
interface CombinedOccurrences {
  /** Distinct team codes present, in a stable order (home, away, [partner home, partner away]). */
  teamCodes: string[];
  actions: TeamCodedAction[];
  consequences: TeamCodedConsequence[];
}

/**
 * One match event to emit, agnostic of DB ids. A merged casualty event carries
 * both an action (on actingTeamCode, from actingSourceBblId) and a consequence
 * (on consequenceTeamCode, from consequenceSourceBblId); an action-only event
 * carries just the action side; a consequence-only event just the consequence.
 */
interface EmittedEvent {
  actionType?: ActionType;
  consequenceType?: ConsequenceType;
  actingTeamCode?: string;
  consequenceTeamCode?: string;
  actingSourceBblId?: string;
  consequenceSourceBblId?: string;
  actingPid?: string | null;
  consequencePid?: string | null;
}

/**
 * Build the combined, team-coded occurrences of one match (or a merged pair,
 * when a partner's events are supplied). Each side occurrence is tagged with
 * the concrete team code it belongs to (homeTeamId/awayTeamId of its own source
 * match) and the source match's bblId, so a merged four-team match's occurrences
 * from both source pages coexist without a home/away collision.
 */
function combineOccurrences(...sources: BblMatchEvents[]): CombinedOccurrences {
  const teamCodes: string[] = [];
  const actions: TeamCodedAction[] = [];
  const consequences: TeamCodedConsequence[] = [];

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
  }

  return { teamCodes, actions, consequences };
}

/**
 * Correlate raw occurrences into events. A casualty action and a
 * Sustained-Injury consequence merge into a single event only when, for a given
 * acting team code and severity group, there is exactly one action candidate on
 * that team and exactly one matching consequence candidate on ANY other team
 * (one other team for a normal 2-team match, three for a merged 4-team match).
 * Everything else — including every ambiguous casualty where 2+ candidates
 * exist — falls through to independent action-only and consequence-only events,
 * so no occurrence is ever dropped. Emission order is merged events first, then
 * leftover actions in occurrence order, then leftover consequences in occurrence
 * order; that order fixes the external-id occurrence indices deterministically.
 */
function correlateEvents(combined: CombinedOccurrences): EmittedEvent[] {
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

  return [...merged, ...actionOnly, ...consequenceOnly];
}

@Injectable()
export class BblMatchEventsImportService {
  constructor(
    private readonly matchListReader: BblMatchListReaderService,
    private readonly matchEventsReader: BblMatchEventsReaderService,
    private readonly teamsImport: TeamsImportService,
    private readonly matchEventsImport: MatchEventsImportService,
    private readonly matchMerge: MatchMergeService,
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
    const merges = await this.matchMerge.resolve(errors);

    for (const [competitionBblId, competition] of competitionsByBblId) {
      const matches = matchesByCompetitionId.get(competitionBblId) ?? [];
      const externalSystemId = competition.externalIds[0].externalSystemId;
      // Team-era ids only depend on the competition's era, so memoize per
      // competition to avoid re-upserting a team shared across its matches.
      const teamEraIdCache = new Map<string, number | undefined>();

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

          // A secondary pair member's occurrences are folded into its primary's
          // combined pass, so skip it here.
          if (merges.isSecondary(match.bblId)) {
            continue;
          }

          const events = eventsByBblId.get(match.bblId);
          if (!events) {
            continue;
          }

          const sources = [events];
          const partnerBblId = merges.partnerBblId(match.bblId);
          if (partnerBblId !== undefined) {
            const partnerEvents = eventsByBblId.get(partnerBblId);
            if (partnerEvents) {
              sources.push(partnerEvents);
            }
          }
          const combined = combineOccurrences(...sources);

          const teamEraIdByCode = new Map<string, number>();
          let unresolvedTeam = false;
          for (const code of combined.teamCodes) {
            const teamEraId = await this.resolveTeamEraId(
              code,
              competition,
              teamsByCode,
              teamEraIdCache,
              errors,
            );
            if (teamEraId === undefined) {
              unresolvedTeam = true;
            } else {
              teamEraIdByCode.set(code, teamEraId);
            }
          }
          if (unresolvedTeam) {
            errors.push(
              makeImportError({
                item: { competition: competition.name, match: match.bblId },
                message: `Skipping match events for match "${match.bblId}" in competition "${competition.name}": could not resolve all team eras.`,
              }),
            );
            continue;
          }

          imported += await this.emitEvents(
            combined,
            matchId,
            externalSystemId,
            teamEraIdByCode,
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
   * Correlate and upsert every event for one match (or merged pair),
   * synthesizing external ids with per-(team, category) occurrence indices under
   * each occurrence's own source match bblId. Returns the number of events whose
   * upsert reported success.
   */
  private async emitEvents(
    combined: CombinedOccurrences,
    matchId: number,
    externalSystemId: number,
    teamEraIdByCode: Map<string, number>,
    playerIdsByPid: Map<string, number>,
    errors: ImportError[],
  ): Promise<number> {
    const occurrenceCounters = new Map<string, number>();
    let imported = 0;

    for (const event of correlateEvents(combined)) {
      const hasAction = event.actionType !== undefined;
      // Every emitted event has at least one side, so teamCode/sourceBblId are
      // always defined here (action side when present, else consequence side).
      const teamCode = hasAction
        ? (event.actingTeamCode as string)
        : (event.consequenceTeamCode as string);
      const sourceBblId = hasAction
        ? (event.actingSourceBblId as string)
        : (event.consequenceSourceBblId as string);
      const category = hasAction
        ? ACTION_CATEGORY[event.actionType as ActionType]
        : CONSEQUENCE_CATEGORY[event.consequenceType as ConsequenceType];

      const counterKey = `${teamCode}-${category}`;
      const occurrenceIndex = occurrenceCounters.get(counterKey) ?? 0;
      occurrenceCounters.set(counterKey, occurrenceIndex + 1);
      const externalId = `${sourceBblId}-${teamCode}-${category}-${occurrenceIndex}`;

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
      if (event.actingTeamCode !== undefined) {
        data.actingTeamEraId = teamEraIdByCode.get(event.actingTeamCode);
      }
      if (event.consequenceTeamCode !== undefined) {
        data.consequenceTeamEraId = teamEraIdByCode.get(
          event.consequenceTeamCode,
        );
      }
      const actingPlayerId = this.resolvePlayerId(
        event.actingPid,
        event.actingSourceBblId ?? sourceBblId,
        playerIdsByPid,
        errors,
      );
      if (actingPlayerId !== undefined) {
        data.actingPlayerId = actingPlayerId;
      }
      const consequencePlayerId = this.resolvePlayerId(
        event.consequencePid,
        event.consequenceSourceBblId ?? sourceBblId,
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
