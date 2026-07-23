import type {
  ActionType,
  ConsequenceType,
  UpsertCompetition,
  UpsertMatchEvent,
  UpsertTeam,
} from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  makeImportError,
  makeImportResult,
  MatchEventsImportService,
  TeamsImportService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { BblMatchListReaderService } from '../matches/bbl-match-list-reader.service';
import type { BblMatchEvents } from '../matches/match-events-page-parser';
import { MatchMergeService } from '../matches/match-merge.service';
import { BblMatchEventsReaderService } from './bbl-match-events-reader.service';
import type { CombinedOccurrences } from './match-event-correlation';
import {
  ACTION_CATEGORY,
  combineOccurrences,
  CONSEQUENCE_CATEGORY,
  correlateEvents,
} from './match-event-correlation';

interface EmitEventsOptions {
  combined: CombinedOccurrences;
  matchId: number;
  externalSystemId: number;
  teamEraIdByCode: Map<string, number>;
  playerIdsByPid: Map<string, number>;
  errors: ImportError[];
}

interface ImportMatchEventsOptions {
  competitionsByBblId: Map<string, UpsertCompetition>;
  teamsByCode: Map<string, UpsertTeam>;
  matchIdsByBblId: Map<string, number>;
  playerIdsByPid: Map<string, number>;
}

interface ResolveTeamEraIdOptions {
  code: string;
  competition: UpsertCompetition;
  teamsByCode: Map<string, UpsertTeam>;
  teamEraIdByCode: Map<string, number | undefined>;
  errors: ImportError[];
}

interface ResolvePlayerIdOptions {
  pid: string | null | undefined;
  matchBblId: string;
  playerIdsByPid: Map<string, number>;
  errors: ImportError[];
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
   * match's raw occurrences (from the shared events reader), resolves its
   * team codes (two for a normal match, four for a merged pair) to their
   * team-era ids under the competition's era, correlates casualty actions
   * with Sustained-Injury consequences (see {@link correlateEvents}),
   * synthesizes a stable external id per event
   * (`<matchBblId>-<teamCode>-<category>-<occurrenceIndex>` under the BBL
   * external system), resolves each player pid to its DB id, and upserts the
   * event. A match with no imported id, or whose team codes do not all
   * resolve to a team era, is recorded as an error and skipped without
   * affecting the rest. A pid with no imported id yields a null player
   * (recorded as a non-fatal error) but the event is still emitted, since the
   * external id does not depend on the player. Idempotent.
   */
  async importMatchEvents({
    competitionsByBblId,
    teamsByCode,
    matchIdsByBblId,
    playerIdsByPid,
  }: ImportMatchEventsOptions): Promise<{ result: ImportResult }> {
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

          const ownEvents = eventsByBblId.get(match.bblId);
          const partnerBblId = merges.partnerBblId(match.bblId);
          const partnerEvents =
            partnerBblId !== undefined
              ? eventsByBblId.get(partnerBblId)
              : undefined;
          const sources = [ownEvents, partnerEvents].filter(
            (e): e is BblMatchEvents => e !== undefined,
          );
          if (sources.length === 0) {
            continue;
          }
          const combined = combineOccurrences(...sources);

          const teamEraIdByCode = new Map<string, number>();
          let unresolvedTeam = false;
          for (const code of combined.teamCodes) {
            const teamEraId = await this.resolveTeamEraId({
              code,
              competition,
              teamsByCode,
              teamEraIdByCode: teamEraIdCache,
              errors,
            });
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

          imported += await this.emitEvents({
            combined,
            matchId,
            externalSystemId,
            teamEraIdByCode,
            playerIdsByPid,
            errors,
          });
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
  private async emitEvents(options: EmitEventsOptions): Promise<number> {
    const {
      combined,
      matchId,
      externalSystemId,
      teamEraIdByCode,
      playerIdsByPid,
      errors,
    } = options;
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

      const data: UpsertMatchEvent = {
        matchId,
        externalIds: [{ externalSystemId, externalId }],
      };
      if (event.actionType !== undefined) {
        data.actionType = event.actionType;
      }
      if (event.consequenceType !== undefined) {
        data.consequenceType = event.consequenceType;
      }
      if (event.journeymenCount !== undefined) {
        data.journeymenCount = event.journeymenCount;
      }
      if (event.actingTeamCode !== undefined) {
        data.actingTeamEraId = teamEraIdByCode.get(event.actingTeamCode);
      }
      if (event.consequenceTeamCode !== undefined) {
        data.consequenceTeamEraId = teamEraIdByCode.get(
          event.consequenceTeamCode,
        );
      }
      const actingPlayerId = this.resolvePlayerId({
        pid: event.actingPid,
        matchBblId: event.actingSourceBblId ?? sourceBblId,
        playerIdsByPid,
        errors,
      });
      if (actingPlayerId !== undefined) {
        data.actingPlayerId = actingPlayerId;
      }
      const consequencePlayerId = this.resolvePlayerId({
        pid: event.consequencePid,
        matchBblId: event.consequenceSourceBblId ?? sourceBblId,
        playerIdsByPid,
        errors,
      });
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
  private async resolveTeamEraId({
    code,
    competition,
    teamsByCode,
    teamEraIdByCode,
    errors,
  }: ResolveTeamEraIdOptions): Promise<number | undefined> {
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
  private resolvePlayerId({
    pid,
    matchBblId,
    playerIdsByPid,
    errors,
  }: ResolvePlayerIdOptions): number | undefined {
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
