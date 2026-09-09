import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { ImportError } from '@blood-bowl-tracker/import';
import { ImportResultService } from '@blood-bowl-tracker/import';
import type { TpOfficialRace } from '@blood-bowl-tracker/parse-tp';
import { OfficialTeamsParserService } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import { SourceConfigService } from './source-config.service';

/** The `<dataDir>` subfolder holding one subdirectory per rules set. */
const OFFICIAL_TEAMS_DIR = 'teams';

/**
 * One official-list race, tagged with the rules set folder it was read from.
 * TP's payload does not name its own rules set -- the folder does, because
 * the downloader visits the teams page once per rules-set tab.
 */
export interface OfficialTeamsEntry {
  race: TpOfficialRace;
  rulesSet: string;
}

@Injectable()
export class OfficialTeamsCollectionService {
  constructor(
    private readonly sourceConfig: SourceConfigService,
    private readonly parser: OfficialTeamsParserService,
    private readonly importResults: ImportResultService,
  ) {}

  /**
   * Read every downloaded official-list file, once, into a flat list of
   * races tagged by rules set. Called once from main.ts and shared by the
   * races, positions and characteristics imports, so a bad file is reported
   * once rather than independently by each -- mirroring
   * RosterCollectionService.collect. A per-file failure is recorded and
   * skipped; a scan failure is recorded and whatever was collected so far is
   * returned.
   */
  async collect(errors: ImportError[]): Promise<OfficialTeamsEntry[]> {
    const entries: OfficialTeamsEntry[] = [];
    const teamsDir = join(this.sourceConfig.getDataDir(), OFFICIAL_TEAMS_DIR);
    let rulesSetDirs;
    try {
      rulesSetDirs = await readdir(teamsDir, { withFileTypes: true });
    } catch (error) {
      errors.push(
        this.importResults.error({
          item: { scan: teamsDir },
          message:
            `Could not read the official team list directory "${teamsDir}": ` +
            `${error instanceof Error ? error.message : String(error)}`,
        }),
      );
      return entries;
    }

    for (const rulesSetDir of rulesSetDirs) {
      if (!rulesSetDir.isDirectory()) {
        continue;
      }
      await this.collectRulesSet({
        dir: join(teamsDir, rulesSetDir.name),
        rulesSet: rulesSetDir.name,
        entries,
        errors,
      });
    }
    return entries;
  }

  /** Every `*.json` file in one rules set's folder, parsed and tagged. */
  private async collectRulesSet(options: {
    dir: string;
    rulesSet: string;
    entries: OfficialTeamsEntry[];
    errors: ImportError[];
  }): Promise<void> {
    const { dir, rulesSet, entries, errors } = options;
    const files = await readdir(dir, { withFileTypes: true });
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith('.json')) {
        continue;
      }
      try {
        const content: unknown = JSON.parse(
          await readFile(join(dir, file.name), 'utf8'),
        );
        for (const race of this.parser.parse(content)) {
          entries.push({ race, rulesSet });
        }
      } catch (error) {
        errors.push(
          this.importResults.error({
            item: { rulesSet, filename: file.name },
            message:
              `Could not parse official team list file "${file.name}" in ` +
              `"${rulesSet}": ` +
              `${error instanceof Error ? error.message : String(error)}`,
          }),
        );
      }
    }
  }
}
