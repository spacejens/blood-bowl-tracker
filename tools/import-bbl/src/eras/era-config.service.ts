import { Injectable } from '@nestjs/common';

import { ImportBblConfigService } from '../config/import-bbl-config.service';

/**
 * One competition hard-assigned to an era and forced to a type, regardless
 * of match dates. startDate/endDate are only consulted by the competitions
 * import's override path when it finds no match dates to derive a range
 * from; ignored otherwise (an overridden competition that has matches always
 * derives its dates from those instead). endDate is optional; startDate is
 * required only in that no-matches case, so it is optional on the type here
 * -- an override for a competition that does have matches never needs one --
 * but a match-less override with no startDate is skipped at import time with
 * a recorded error.
 */
export interface CompetitionOverride {
  bblId: string;
  type: 'season' | 'cup';
  startDate?: string;
  endDate?: string;
}

export interface EraConfig {
  /**
   * Name of the league this era belongs to, stamped by getEras() from the
   * containing leagues[] entry. Used by the eras import to resolve the era's
   * league id. Optional on the type because hand-built test fixtures may omit
   * it; getEras() always sets it.
   */
  leagueName?: string;
  identity: {
    name: string;
    rulesSets: string[];
  };
  dates: {
    startDate: string;
    endDate?: string;
    /**
     * When false, this era is excluded from the match-date -> era resolution
     * scan (bbl-competitions-import). Its startDate/endDate are still imported
     * into the era DB record. Override lists resolve competitions regardless.
     */
    autoAssignByDate: boolean;
  };
  players: {
    /** Required when autoAssignByPlayerId is true; optional otherwise. */
    firstPlayerId?: number;
    lastPlayerId?: number;
    /**
     * When false, this era is excluded from the pid-range fallback scan
     * (bbl-players-import). Override lists still pin players to the era.
     */
    autoAssignByPlayerId: boolean;
    /**
     * Explicit pids assigned to this era regardless of firstPlayerId/
     * lastPlayerId, for players drafted right at an era boundary whose pid
     * lands on the "wrong" side of the range split. Checked before the range.
     */
    playerIdOverrides?: number[];
  };
  competitions?: {
    /**
     * Competitions hard-assigned to this era and forced to a type, regardless
     * of match dates -- for a competition with a genuinely empty match list,
     * or whose date span would otherwise misclassify its type. Checked
     * before the match-date scan, so unaffected by autoAssignByDate. A
     * competition bblId may appear in only one override, in only one era,
     * across all eras.
     */
    overrides?: CompetitionOverride[];
  };
  teams?: {
    /** Team codes whose players are pinned to this era regardless of pid. */
    teamCodeOverrides?: string[];
  };
  matches?: {
    /**
     * BBL match-id pairs to merge into one match. Per-pair and cross-era
     * uniqueness validation lives in MatchMergeConfigService, which flattens
     * these across all eras — so the entries are carried untyped here.
     * Optional: an era may carry only categoryOverrides.
     */
    merges?: unknown[];
    /**
     * Explicit match-category assignments for matches the keyword classifier
     * cannot recognize (thematic cup finals such as "Bierhallentodball", or
     * stage-like names it deliberately refuses to guess at). Per-entry shape
     * and cross-era uniqueness validation lives in
     * MatchCategoryConfigService, so entries are carried untyped here.
     */
    categoryOverrides?: unknown[];
    /**
     * Explicit match outcomes for matches whose winner cannot be determined
     * from scores plus the source's own placement data (or that the source
     * gets wrong). Per-entry shape and cross-era uniqueness validation lives
     * in MatchResultConfigService, so entries are carried untyped here.
     */
    resultOverrides?: unknown[];
  };
  /**
   * Position availability overrides for this era, for cases where the
   * zero-players heuristic mis-decides a position's availability. The era is
   * implied by the containing era block (no eraId field).
   */
  positions?: {
    /** BBL position typId. */
    positionId: string;
    /** BBL race bblId. */
    raceId: string;
    available: boolean;
  }[];
}

/**
 * Validates a value is an ISO `YYYY-MM-DD` date string that refers to a real
 * calendar day (rejecting e.g. `2021-02-30`, which `Date` would otherwise roll
 * over). Round-trips through a UTC `Date` and compares the normalized date part.
 */
function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((v) => typeof v === 'string' && v.trim() !== '')
  );
}

@Injectable()
export class EraConfigService {
  constructor(private readonly config: ImportBblConfigService) {}

  /**
   * The eras the BBL leagues played through, supplied via leagues[].eras in
   * import-bbl-config.json5 (not parsed from the source data). Each league
   * entry's eras are flattened into one list and stamped with that league's
   * leagueName. Each era is six nested groups: identity, dates, players (all
   * required), and optional competitions, teams, matches. See EraConfig for
   * field meanings.
   */
  getEras(): EraConfig[] {
    const leaguesRaw = this.config.get<unknown>('leagues');
    if (leaguesRaw === undefined) {
      throw new Error(
        'leagues is not set in import-bbl-config.json5. Set it to a ' +
          'non-empty array of leagues, each with a leagueName and an eras ' +
          'array, e.g. [{ leagueName: "tLoEG", eras: [ ... ] }].',
      );
    }
    if (!Array.isArray(leaguesRaw) || leaguesRaw.length === 0) {
      throw new Error(
        'leagues in import-bbl-config.json5 must be a non-empty array of leagues.',
      );
    }

    const eras: EraConfig[] = [];
    leaguesRaw.forEach((leagueEntry, leagueIndex) => {
      if (typeof leagueEntry !== 'object' || leagueEntry === null) {
        throw new Error(`leagues[${leagueIndex}] must be an object.`);
      }
      const { leagueName, eras: leagueEras } = leagueEntry as Record<
        string,
        unknown
      >;
      if (typeof leagueName !== 'string' || leagueName.trim() === '') {
        throw new Error(
          `leagues[${leagueIndex}].leagueName must be a non-empty string.`,
        );
      }
      if (!Array.isArray(leagueEras) || leagueEras.length === 0) {
        throw new Error(
          `leagues[${leagueIndex}].eras must be a non-empty array of eras.`,
        );
      }
      leagueEras.forEach((entry, eraIndex) => {
        const parsed = this.parseEra(entry, eraIndex);
        eras.push({ ...parsed, leagueName });
      });
    });

    const eraNameSeen = new Map<string, string>();
    for (const era of eras) {
      const existing = eraNameSeen.get(era.identity.name);
      if (existing !== undefined) {
        throw new Error(
          `BBL_ERAS: era name "${era.identity.name}" is used in more than one ` +
            `league (leagues "${existing}" and "${era.leagueName}"). Era names ` +
            `must be unique across all leagues.`,
        );
      }
      // era.leagueName is always set here: every entry in `eras` was just
      // constructed above from a validated, non-empty leagueName.
      eraNameSeen.set(era.identity.name, era.leagueName as string);
    }

    const eraNameByOverriddenPid = new Map<number, string>();
    for (const era of eras) {
      for (const pid of era.players.playerIdOverrides ?? []) {
        const existing = eraNameByOverriddenPid.get(pid);
        if (existing !== undefined) {
          throw new Error(
            `BBL_ERAS: player id ${pid} appears in playerIdOverrides for both "${existing}" and "${era.identity.name}".`,
          );
        }
        eraNameByOverriddenPid.set(pid, era.identity.name);
      }
    }

    const eraNameByOverriddenCompetitionId = new Map<string, string>();
    for (const era of eras) {
      for (const override of era.competitions?.overrides ?? []) {
        const existing = eraNameByOverriddenCompetitionId.get(override.bblId);
        if (existing !== undefined) {
          throw new Error(
            `BBL_ERAS: competition id ${override.bblId} appears in competitions.overrides for both "${existing}" and "${era.identity.name}".`,
          );
        }
        eraNameByOverriddenCompetitionId.set(override.bblId, era.identity.name);
      }
    }

    const eraNameByOverriddenTeamCode = new Map<string, string>();
    for (const era of eras) {
      for (const teamCode of era.teams?.teamCodeOverrides ?? []) {
        const existing = eraNameByOverriddenTeamCode.get(teamCode);
        if (existing !== undefined) {
          throw new Error(
            `BBL_ERAS: team code ${teamCode} appears in teamCodeOverrides for both "${existing}" and "${era.identity.name}".`,
          );
        }
        eraNameByOverriddenTeamCode.set(teamCode, era.identity.name);
      }
    }

    return eras;
  }

  private parseEra(entry: unknown, index: number): EraConfig {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error(`BBL_ERAS[${index}] must be an object.`);
    }
    const record = entry as Record<string, unknown>;

    const identity = this.parseIdentity(record.identity, index);
    const dates = this.parseDates(record.dates, index);
    const players = this.parsePlayers(record.players, index);
    const competitions = this.parseCompetitions(record.competitions, index);
    const teams = this.parseTeams(record.teams, index);
    const matches = this.parseMatches(record.matches, index);
    const positions = this.parsePositions(record.positions, index);

    return {
      identity,
      dates,
      players,
      ...(competitions !== undefined ? { competitions } : {}),
      ...(teams !== undefined ? { teams } : {}),
      ...(matches !== undefined ? { matches } : {}),
      ...(positions !== undefined ? { positions } : {}),
    };
  }

  private parseIdentity(raw: unknown, index: number): EraConfig['identity'] {
    if (typeof raw !== 'object' || raw === null) {
      throw new Error(`BBL_ERAS[${index}].identity must be an object.`);
    }
    const { name, rulesSets } = raw as Record<string, unknown>;
    if (typeof name !== 'string' || name.trim() === '') {
      throw new Error(
        `BBL_ERAS[${index}].identity.name must be a non-empty string.`,
      );
    }
    if (
      !Array.isArray(rulesSets) ||
      rulesSets.length === 0 ||
      !rulesSets.every((r) => typeof r === 'string' && r.trim() !== '')
    ) {
      throw new Error(
        `BBL_ERAS[${index}].identity.rulesSets must be a non-empty array of non-empty strings.`,
      );
    }
    return { name, rulesSets: rulesSets as string[] };
  }

  private parseDates(raw: unknown, index: number): EraConfig['dates'] {
    if (typeof raw !== 'object' || raw === null) {
      throw new Error(`BBL_ERAS[${index}].dates must be an object.`);
    }
    const { startDate, endDate, autoAssignByDate } = raw as Record<
      string,
      unknown
    >;
    if (!isValidIsoDate(startDate)) {
      throw new Error(
        `BBL_ERAS[${index}].dates.startDate must be an ISO date (YYYY-MM-DD).`,
      );
    }
    if (endDate !== undefined && !isValidIsoDate(endDate)) {
      throw new Error(
        `BBL_ERAS[${index}].dates.endDate must be an ISO date (YYYY-MM-DD) when present.`,
      );
    }
    if (typeof autoAssignByDate !== 'boolean') {
      throw new Error(
        `BBL_ERAS[${index}].dates.autoAssignByDate must be a boolean.`,
      );
    }
    return {
      startDate,
      autoAssignByDate,
      ...(endDate !== undefined ? { endDate } : {}),
    };
  }

  private parsePlayers(raw: unknown, index: number): EraConfig['players'] {
    if (typeof raw !== 'object' || raw === null) {
      throw new Error(`BBL_ERAS[${index}].players must be an object.`);
    }
    const {
      firstPlayerId,
      lastPlayerId,
      autoAssignByPlayerId,
      playerIdOverrides,
    } = raw as Record<string, unknown>;

    if (typeof autoAssignByPlayerId !== 'boolean') {
      throw new Error(
        `BBL_ERAS[${index}].players.autoAssignByPlayerId must be a boolean.`,
      );
    }
    if (autoAssignByPlayerId) {
      if (!isPositiveInteger(firstPlayerId)) {
        throw new Error(
          `BBL_ERAS[${index}].players.firstPlayerId must be a positive integer.`,
        );
      }
    } else if (
      firstPlayerId !== undefined &&
      !isPositiveInteger(firstPlayerId)
    ) {
      throw new Error(
        `BBL_ERAS[${index}].players.firstPlayerId must be a positive integer when present.`,
      );
    }
    if (lastPlayerId !== undefined && !isPositiveInteger(lastPlayerId)) {
      throw new Error(
        `BBL_ERAS[${index}].players.lastPlayerId must be a positive integer when present.`,
      );
    }
    if (lastPlayerId !== undefined && firstPlayerId === undefined) {
      throw new Error(
        `BBL_ERAS[${index}].players.lastPlayerId requires firstPlayerId to be set.`,
      );
    }
    if (
      isPositiveInteger(firstPlayerId) &&
      isPositiveInteger(lastPlayerId) &&
      firstPlayerId > lastPlayerId
    ) {
      throw new Error(
        `BBL_ERAS[${index}].players.firstPlayerId must be less than or equal to lastPlayerId.`,
      );
    }
    if (
      playerIdOverrides !== undefined &&
      (!Array.isArray(playerIdOverrides) ||
        !playerIdOverrides.every(isPositiveInteger))
    ) {
      throw new Error(
        `BBL_ERAS[${index}].players.playerIdOverrides must be an array of positive integers when present.`,
      );
    }

    return {
      autoAssignByPlayerId,
      ...(firstPlayerId !== undefined ? { firstPlayerId } : {}),
      ...(lastPlayerId !== undefined ? { lastPlayerId } : {}),
      ...(playerIdOverrides !== undefined
        ? { playerIdOverrides: playerIdOverrides }
        : {}),
    };
  }

  private parseCompetitions(
    raw: unknown,
    index: number,
  ): EraConfig['competitions'] {
    if (raw === undefined) {
      return undefined;
    }
    if (typeof raw !== 'object' || raw === null) {
      throw new Error(`BBL_ERAS[${index}].competitions must be an object.`);
    }
    const { overrides } = raw as Record<string, unknown>;
    const parsedOverrides = this.parseCompetitionOverrides(overrides, index);
    return {
      ...(parsedOverrides !== undefined ? { overrides: parsedOverrides } : {}),
    };
  }

  private parseCompetitionOverrides(
    raw: unknown,
    index: number,
  ): NonNullable<EraConfig['competitions']>['overrides'] {
    if (raw === undefined) {
      return undefined;
    }
    if (!Array.isArray(raw)) {
      throw new Error(
        `BBL_ERAS[${index}].competitions.overrides must be an array of override objects.`,
      );
    }
    const seenInEra = new Set<string>();
    return raw.map((entry, overrideIndex) => {
      const prefix = `BBL_ERAS[${index}].competitions.overrides[${overrideIndex}]`;
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
        throw new Error(
          `${prefix} must be an object with bblId, type, and optional startDate/endDate.`,
        );
      }
      const { bblId, type, startDate, endDate } = entry as Record<
        string,
        unknown
      >;
      if (typeof bblId !== 'string' || bblId.trim() === '') {
        throw new Error(`${prefix}.bblId must be a non-empty string.`);
      }
      if (type !== 'season' && type !== 'cup') {
        throw new Error(`${prefix}.type must be "season" or "cup".`);
      }
      if (startDate !== undefined && !isValidIsoDate(startDate)) {
        throw new Error(
          `${prefix}.startDate must be an ISO date (YYYY-MM-DD) when present.`,
        );
      }
      if (endDate !== undefined && !isValidIsoDate(endDate)) {
        throw new Error(
          `${prefix}.endDate must be an ISO date (YYYY-MM-DD) when present.`,
        );
      }
      if (endDate !== undefined && startDate === undefined) {
        throw new Error(`${prefix}.endDate requires startDate to also be set.`);
      }
      if (
        startDate !== undefined &&
        endDate !== undefined &&
        endDate < startDate
      ) {
        throw new Error(`${prefix}.endDate must not be before startDate.`);
      }
      if (seenInEra.has(bblId)) {
        throw new Error(
          `BBL_ERAS[${index}].competitions.overrides: competition id ${bblId} appears more than once.`,
        );
      }
      seenInEra.add(bblId);
      return {
        bblId,
        type,
        ...(startDate !== undefined ? { startDate } : {}),
        ...(endDate !== undefined ? { endDate } : {}),
      };
    });
  }

  private parseTeams(raw: unknown, index: number): EraConfig['teams'] {
    if (raw === undefined) {
      return undefined;
    }
    if (typeof raw !== 'object' || raw === null) {
      throw new Error(`BBL_ERAS[${index}].teams must be an object.`);
    }
    const { teamCodeOverrides } = raw as Record<string, unknown>;
    if (
      teamCodeOverrides !== undefined &&
      !isNonEmptyStringArray(teamCodeOverrides)
    ) {
      throw new Error(
        `BBL_ERAS[${index}].teams.teamCodeOverrides must be an array of non-empty strings when present.`,
      );
    }
    return {
      ...(teamCodeOverrides !== undefined
        ? { teamCodeOverrides: teamCodeOverrides }
        : {}),
    };
  }

  private parseMatches(raw: unknown, index: number): EraConfig['matches'] {
    if (raw === undefined) {
      return undefined;
    }
    if (typeof raw !== 'object' || raw === null) {
      throw new Error(`BBL_ERAS[${index}].matches must be an object.`);
    }
    const { merges, categoryOverrides, resultOverrides } = raw as Record<
      string,
      unknown
    >;
    if (merges !== undefined && !Array.isArray(merges)) {
      throw new Error(
        `BBL_ERAS[${index}].matches.merges must be an array of [id, id] pairs.`,
      );
    }
    if (categoryOverrides !== undefined && !Array.isArray(categoryOverrides)) {
      throw new Error(
        `BBL_ERAS[${index}].matches.categoryOverrides must be an array of ` +
          '{ matchId, category } entries.',
      );
    }
    if (resultOverrides !== undefined && !Array.isArray(resultOverrides)) {
      throw new Error(
        `BBL_ERAS[${index}].matches.resultOverrides must be an array of ` +
          '{ matchId, winnerTeamCode } entries.',
      );
    }
    return {
      ...(merges !== undefined ? { merges } : {}),
      ...(categoryOverrides !== undefined ? { categoryOverrides } : {}),
      ...(resultOverrides !== undefined ? { resultOverrides } : {}),
    };
  }

  private parsePositions(raw: unknown, index: number): EraConfig['positions'] {
    if (raw === undefined) {
      return undefined;
    }
    if (!Array.isArray(raw)) {
      throw new Error(`BBL_ERAS[${index}].positions must be an array.`);
    }
    return raw.map((entry, entryIndex) => {
      if (typeof entry !== 'object' || entry === null) {
        throw new Error(
          `BBL_ERAS[${index}].positions[${entryIndex}] must be an object.`,
        );
      }
      const { positionId, raceId, available } = entry as Record<
        string,
        unknown
      >;
      if (typeof positionId !== 'string' || positionId.trim() === '') {
        throw new Error(
          `BBL_ERAS[${index}].positions[${entryIndex}].positionId must be a non-empty string.`,
        );
      }
      if (typeof raceId !== 'string' || raceId.trim() === '') {
        throw new Error(
          `BBL_ERAS[${index}].positions[${entryIndex}].raceId must be a non-empty string.`,
        );
      }
      if (typeof available !== 'boolean') {
        throw new Error(
          `BBL_ERAS[${index}].positions[${entryIndex}].available must be a boolean.`,
        );
      }
      return { positionId, raceId, available };
    });
  }
}
