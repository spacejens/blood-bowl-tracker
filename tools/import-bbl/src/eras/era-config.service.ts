import { Injectable } from '@nestjs/common';

import { ImportBblConfigService } from '../config/import-bbl-config.service';

export interface EraConfig {
  name: string;
  rulesSets: string[];
  startDate: string;
  endDate?: string;
  firstPlayerId: number;
  lastPlayerId?: number;
  /**
   * Explicit pids assigned to this era regardless of firstPlayerId/lastPlayerId
   * — for players drafted right at an era boundary whose pid lands on the
   * "wrong" side of the range split (BBL player ids are roughly, not exactly,
   * chronological). Checked before the range bounds.
   */
  playerIdOverrides?: number[];
  /**
   * Explicit competition bblIds hard-assigned to this era and forced to type
   * 'season' regardless of their match dates — for competitions with a genuinely
   * empty match list, which have no date signal to resolve an era from. Checked
   * before match-date-based era resolution, exactly like playerIdOverrides pins
   * a player to an era. Competition bblIds are strings elsewhere in this
   * codebase (e.g. BblCompetition.bblId).
   */
  seasonCompetitionIdOverrides?: string[];
  /**
   * Explicit competition bblIds hard-assigned to this era and forced to type
   * 'cup' regardless of their match dates — the symmetric counterpart of
   * seasonCompetitionIdOverrides. Needed for cups whose match-date span exceeds
   * CUP_MAX_SPAN_DAYS (e.g. an abandoned cup) and would otherwise compute
   * 'season'. Checked before match-date-based type/era resolution.
   */
  cupCompetitionIdOverrides?: string[];
  /**
   * Team codes whose players are pinned to this era regardless of their pid —
   * for side-competition eras (Stunty Leeg, Dungeonbowl) whose players share
   * the pid range of the concurrent regular era. Checked before
   * playerIdOverrides and the firstPlayerId/lastPlayerId range, mirroring how
   * seasonCompetitionIdOverrides/cupCompetitionIdOverrides are checked before
   * match-date resolution. Team codes are the BBL team page `t` param.
   */
  teamCodeOverrides?: string[];
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

@Injectable()
export class EraConfigService {
  constructor(private readonly config: ImportBblConfigService) {}

  /**
   * The eras the BBL league played through, supplied via the eras key in
   * import-bbl-config.json5 (not parsed from the source data).
   * Each era names its rules set and its date range; endDate is optional for an
   * era still ongoing at import time. firstPlayerId is required; lastPlayerId
   * follows the same optional-when-ongoing rule as endDate, and the two must
   * be either both omitted or both present.
   */
  getEras(): EraConfig[] {
    const raw = this.config.get<unknown>('eras');
    if (raw === undefined) {
      throw new Error(
        'eras is not set in import-bbl-config.json5. Set it to an array of ' +
          'the eras the BBL league played through, e.g. ' +
          '[{ name: "Living rulebook", rulesSets: ["Living rulebook"], ' +
          'startDate: "2011-09-09", endDate: "2021-09-01" }].',
      );
    }

    if (!Array.isArray(raw) || raw.length === 0) {
      throw new Error(
        'eras in import-bbl-config.json5 must be a non-empty array of eras.',
      );
    }

    const eras = raw.map((entry, index) => this.parseEra(entry, index));

    const eraNameByOverriddenPid = new Map<number, string>();
    for (const era of eras) {
      for (const pid of era.playerIdOverrides ?? []) {
        const existing = eraNameByOverriddenPid.get(pid);
        if (existing !== undefined) {
          throw new Error(
            `BBL_ERAS: player id ${pid} appears in playerIdOverrides for both "${existing}" and "${era.name}".`,
          );
        }
        eraNameByOverriddenPid.set(pid, era.name);
      }
    }

    const eraNameByOverriddenCompetitionId = new Map<string, string>();
    for (const era of eras) {
      for (const bblId of [
        ...(era.seasonCompetitionIdOverrides ?? []),
        ...(era.cupCompetitionIdOverrides ?? []),
      ]) {
        const existing = eraNameByOverriddenCompetitionId.get(bblId);
        if (existing !== undefined) {
          throw new Error(
            `BBL_ERAS: competition id ${bblId} appears in seasonCompetitionIdOverrides/cupCompetitionIdOverrides for both "${existing}" and "${era.name}".`,
          );
        }
        eraNameByOverriddenCompetitionId.set(bblId, era.name);
      }
    }

    const eraNameByOverriddenTeamCode = new Map<string, string>();
    for (const era of eras) {
      for (const teamCode of era.teamCodeOverrides ?? []) {
        const existing = eraNameByOverriddenTeamCode.get(teamCode);
        if (existing !== undefined) {
          throw new Error(
            `BBL_ERAS: team code ${teamCode} appears in teamCodeOverrides for both "${existing}" and "${era.name}".`,
          );
        }
        eraNameByOverriddenTeamCode.set(teamCode, era.name);
      }
    }

    return eras;
  }

  private parseEra(entry: unknown, index: number): EraConfig {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error(`BBL_ERAS[${index}] must be an object.`);
    }
    const record = entry as Record<string, unknown>;

    const {
      name,
      rulesSets,
      startDate,
      endDate,
      firstPlayerId,
      lastPlayerId,
      playerIdOverrides,
      seasonCompetitionIdOverrides,
      cupCompetitionIdOverrides,
      teamCodeOverrides,
    } = record;

    if (typeof name !== 'string' || name.trim() === '') {
      throw new Error(`BBL_ERAS[${index}].name must be a non-empty string.`);
    }
    if (
      !Array.isArray(rulesSets) ||
      rulesSets.length === 0 ||
      !rulesSets.every((r) => typeof r === 'string' && r.trim() !== '')
    ) {
      throw new Error(
        `BBL_ERAS[${index}].rulesSets must be a non-empty array of non-empty strings.`,
      );
    }
    if (!isValidIsoDate(startDate)) {
      throw new Error(
        `BBL_ERAS[${index}].startDate must be an ISO date (YYYY-MM-DD).`,
      );
    }
    if (endDate !== undefined && !isValidIsoDate(endDate)) {
      throw new Error(
        `BBL_ERAS[${index}].endDate must be an ISO date (YYYY-MM-DD) when present.`,
      );
    }

    if (!isPositiveInteger(firstPlayerId)) {
      throw new Error(
        `BBL_ERAS[${index}].firstPlayerId must be a positive integer.`,
      );
    }
    if (lastPlayerId !== undefined && !isPositiveInteger(lastPlayerId)) {
      throw new Error(
        `BBL_ERAS[${index}].lastPlayerId must be a positive integer when present.`,
      );
    }
    if (isPositiveInteger(lastPlayerId) && firstPlayerId > lastPlayerId) {
      throw new Error(
        `BBL_ERAS[${index}].firstPlayerId must be less than or equal to lastPlayerId.`,
      );
    }
    if ((endDate === undefined) !== (lastPlayerId === undefined)) {
      throw new Error(
        `BBL_ERAS[${index}]: endDate and lastPlayerId must be either both omitted (an era still ongoing) or both present.`,
      );
    }

    if (
      playerIdOverrides !== undefined &&
      (!Array.isArray(playerIdOverrides) ||
        !playerIdOverrides.every(isPositiveInteger))
    ) {
      throw new Error(
        `BBL_ERAS[${index}].playerIdOverrides must be an array of positive integers when present.`,
      );
    }

    if (
      seasonCompetitionIdOverrides !== undefined &&
      (!Array.isArray(seasonCompetitionIdOverrides) ||
        !seasonCompetitionIdOverrides.every(
          (id) => typeof id === 'string' && id.trim() !== '',
        ))
    ) {
      throw new Error(
        `BBL_ERAS[${index}].seasonCompetitionIdOverrides must be an array of non-empty strings when present.`,
      );
    }

    if (
      cupCompetitionIdOverrides !== undefined &&
      (!Array.isArray(cupCompetitionIdOverrides) ||
        !cupCompetitionIdOverrides.every(
          (id) => typeof id === 'string' && id.trim() !== '',
        ))
    ) {
      throw new Error(
        `BBL_ERAS[${index}].cupCompetitionIdOverrides must be an array of non-empty strings when present.`,
      );
    }

    if (
      teamCodeOverrides !== undefined &&
      (!Array.isArray(teamCodeOverrides) ||
        !teamCodeOverrides.every(
          (code) => typeof code === 'string' && code.trim() !== '',
        ))
    ) {
      throw new Error(
        `BBL_ERAS[${index}].teamCodeOverrides must be an array of non-empty strings when present.`,
      );
    }

    return {
      name,
      rulesSets: rulesSets as string[],
      startDate,
      firstPlayerId,
      ...(endDate !== undefined ? { endDate } : {}),
      ...(lastPlayerId !== undefined ? { lastPlayerId } : {}),
      ...(playerIdOverrides !== undefined
        ? { playerIdOverrides: playerIdOverrides }
        : {}),
      ...(seasonCompetitionIdOverrides !== undefined
        ? { seasonCompetitionIdOverrides: seasonCompetitionIdOverrides }
        : {}),
      ...(cupCompetitionIdOverrides !== undefined
        ? { cupCompetitionIdOverrides: cupCompetitionIdOverrides }
        : {}),
      ...(teamCodeOverrides !== undefined
        ? { teamCodeOverrides: teamCodeOverrides }
        : {}),
    };
  }
}
