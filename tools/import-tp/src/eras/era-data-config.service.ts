import { Injectable } from '@nestjs/common';

import { ImportTpConfigService } from '../config/import-tp-config.service';

export interface EraDataConfig {
  /** The era's display name in the database (identity.name). */
  name: string;
  /** The subdirectory under dataDir holding this era's TP files. */
  dataSubdir: string;
  /** Rule set names this era spans, in chronological order (non-empty). */
  rulesSets: string[];
  /** ISO YYYY-MM-DD start date (required). */
  startDate: string;
  /** ISO YYYY-MM-DD end date; omitted for an era still ongoing. */
  endDate?: string;
}

/**
 * Validates a value is an ISO `YYYY-MM-DD` date string referring to a real
 * calendar day (rejecting e.g. `2021-02-30`). Round-trips through a UTC Date
 * and compares the normalized date part. Mirrors import-bbl's isValidIsoDate.
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

@Injectable()
export class EraDataConfigService {
  constructor(private readonly config: ImportTpConfigService) {}

  /**
   * The eras to import, supplied via `league.eras` in import-tp-config.json5.
   * Each entry maps an era's identity (name + rule sets) and dates to the data
   * subdirectory holding its downloaded TP files. Rule sets and dates are not
   * present in TP's data, so they are config-supplied (same as import-bbl).
   * Names and subdirs must each be unique across all entries.
   */
  getEras(): EraDataConfig[] {
    const league = this.config.get<Record<string, unknown>>('league');
    const raw = league?.eras;
    if (raw === undefined) {
      throw new Error(
        'league.eras is not set in import-tp-config.json5. Set it to an ' +
          'array of the eras the league played through, e.g. ' +
          "[{ identity: { name: 'Fourth era', rulesSets: ['BB2020'] }, " +
          "dates: { startDate: '2020-11-28' }, dataSubdir: 'fourth-era' }].",
      );
    }
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new Error(
        'league.eras in import-tp-config.json5 must be a non-empty array of eras.',
      );
    }

    const eras = raw.map((entry, index) => this.parseEra(entry, index));

    const seenNames = new Set<string>();
    const seenSubdirs = new Set<string>();
    for (const era of eras) {
      if (seenNames.has(era.name)) {
        throw new Error(
          `TP_ERAS: era name "${era.name}" appears more than once.`,
        );
      }
      seenNames.add(era.name);
      if (seenSubdirs.has(era.dataSubdir)) {
        throw new Error(
          `TP_ERAS: dataSubdir "${era.dataSubdir}" appears more than once.`,
        );
      }
      seenSubdirs.add(era.dataSubdir);
    }

    return eras;
  }

  private parseEra(entry: unknown, index: number): EraDataConfig {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error(`TP_ERAS[${index}] must be an object.`);
    }
    const record = entry as Record<string, unknown>;
    const { name, rulesSets } = this.parseIdentity(record.identity, index);
    const { startDate, endDate } = this.parseDates(record.dates, index);
    const dataSubdir = record.dataSubdir;
    if (typeof dataSubdir !== 'string' || dataSubdir.trim() === '') {
      throw new Error(
        `TP_ERAS[${index}].dataSubdir must be a non-empty string.`,
      );
    }
    return {
      name,
      dataSubdir,
      rulesSets,
      startDate,
      ...(endDate !== undefined ? { endDate } : {}),
    };
  }

  private parseIdentity(
    raw: unknown,
    index: number,
  ): { name: string; rulesSets: string[] } {
    if (typeof raw !== 'object' || raw === null) {
      throw new Error(`TP_ERAS[${index}].identity must be an object.`);
    }
    const { name, rulesSets } = raw as Record<string, unknown>;
    if (typeof name !== 'string' || name.trim() === '') {
      throw new Error(
        `TP_ERAS[${index}].identity.name must be a non-empty string.`,
      );
    }
    if (
      !Array.isArray(rulesSets) ||
      rulesSets.length === 0 ||
      !rulesSets.every((r) => typeof r === 'string' && r.trim() !== '')
    ) {
      throw new Error(
        `TP_ERAS[${index}].identity.rulesSets must be a non-empty array of non-empty strings.`,
      );
    }
    return { name, rulesSets: rulesSets as string[] };
  }

  private parseDates(
    raw: unknown,
    index: number,
  ): { startDate: string; endDate?: string } {
    if (typeof raw !== 'object' || raw === null) {
      throw new Error(`TP_ERAS[${index}].dates must be an object.`);
    }
    const { startDate, endDate } = raw as Record<string, unknown>;
    if (!isValidIsoDate(startDate)) {
      throw new Error(
        `TP_ERAS[${index}].dates.startDate must be an ISO date (YYYY-MM-DD).`,
      );
    }
    if (endDate !== undefined && !isValidIsoDate(endDate)) {
      throw new Error(
        `TP_ERAS[${index}].dates.endDate must be an ISO date (YYYY-MM-DD) when present.`,
      );
    }
    return { startDate, ...(endDate !== undefined ? { endDate } : {}) };
  }
}
