import { ConfigErrorMessageService } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { ImportTpConfigService } from '../config/import-tp-config.service';
import { eraDataConfigSchema } from './era-data-config.schema';

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

@Injectable()
export class EraDataConfigService {
  constructor(
    private readonly config: ImportTpConfigService,
    private readonly messages: ConfigErrorMessageService,
  ) {}

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

    const eras = raw.map((entry, index) => {
      const parsed = eraDataConfigSchema.safeParse(entry);
      if (!parsed.success) {
        throw new Error(
          this.messages.format(`TP_ERAS[${index}]`, parsed.error),
        );
      }
      return {
        name: parsed.data.identity.name,
        dataSubdir: parsed.data.dataSubdir,
        rulesSets: parsed.data.identity.rulesSets,
        startDate: parsed.data.dates.startDate,
        ...(parsed.data.dates.endDate !== undefined
          ? { endDate: parsed.data.dates.endDate }
          : {}),
      };
    });

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
}
