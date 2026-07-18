import { Injectable } from '@nestjs/common';

import { ImportTpConfigService } from '../config/import-tp-config.service';

export interface EraDataConfig {
  name: string;
  dataSubdir: string;
}

@Injectable()
export class EraDataConfigService {
  constructor(private readonly config: ImportTpConfigService) {}

  /**
   * The eras to import from, supplied via the top-level `eras` array in
   * import-tp-config.json5. Each entry maps an era's display name to the data
   * subdirectory holding its downloaded TP files. Both fields are required and
   * non-empty; names and subdirs must each be unique across all entries.
   */
  getEras(): EraDataConfig[] {
    const raw = this.config.get<unknown>('eras');
    if (raw === undefined) {
      throw new Error(
        'eras is not set in import-tp-config.json5. Set it to an array of ' +
          "eras to import, e.g. [{ name: 'Fourth era', dataSubdir: " +
          "'fourth-era' }].",
      );
    }
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new Error(
        'eras in import-tp-config.json5 must be a non-empty array of eras.',
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
    const { name, dataSubdir } = entry as Record<string, unknown>;
    if (typeof name !== 'string' || name.trim() === '') {
      throw new Error(`TP_ERAS[${index}].name must be a non-empty string.`);
    }
    if (typeof dataSubdir !== 'string' || dataSubdir.trim() === '') {
      throw new Error(
        `TP_ERAS[${index}].dataSubdir must be a non-empty string.`,
      );
    }
    return { name, dataSubdir };
  }
}
