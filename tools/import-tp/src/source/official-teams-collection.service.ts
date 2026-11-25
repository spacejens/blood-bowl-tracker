import { join } from 'node:path';

import type { TpOfficialRace } from '@blood-bowl-tracker/api-contract';
import type { ImportError } from '@blood-bowl-tracker/import';
import { ImportResultService } from '@blood-bowl-tracker/import';
import { OfficialTeamsParserService } from '@blood-bowl-tracker/parse-tp';
import {
  TP_TEAMS_DIR,
  TpFilesReaderService,
} from '@blood-bowl-tracker/read-tp-files';
import { Injectable } from '@nestjs/common';

import { SourceConfigService } from './source-config.service';

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
    private readonly files: TpFilesReaderService,
  ) {}

  /**
   * Read every downloaded official-list file, once, into a flat list of
   * races tagged by rules set. Called once from main.ts and shared by the
   * races, positions and characteristics imports, so a bad file is reported
   * once rather than independently by each -- mirroring
   * RosterCollectionService.collect. A per-file failure is recorded and
   * skipped; a scan failure -- of the top-level teams directory or of one
   * rules set's own directory -- is recorded and whatever was collected so
   * far is returned (a per-rules-set scan failure skips just that rules set
   * and continues with the next).
   */
  async collect(errors: ImportError[]): Promise<OfficialTeamsEntry[]> {
    const entries: OfficialTeamsEntry[] = [];
    const dataDir = this.sourceConfig.getDataDir();
    const teamsDir = join(dataDir, TP_TEAMS_DIR);
    let rulesSets: string[];
    try {
      rulesSets = await this.files.listTeamsRulesSets(dataDir);
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

    for (const rulesSet of rulesSets) {
      await this.collectRulesSet({ dataDir, rulesSet, entries, errors });
    }
    return entries;
  }

  /** Every `*.json` file in one rules set's folder, parsed and tagged. */
  private async collectRulesSet(options: {
    dataDir: string;
    rulesSet: string;
    entries: OfficialTeamsEntry[];
    errors: ImportError[];
  }): Promise<void> {
    const { dataDir, rulesSet, entries, errors } = options;
    const dir = join(dataDir, TP_TEAMS_DIR, rulesSet);
    let filenames: string[];
    try {
      filenames = await this.files.listTeamsFiles(dataDir, rulesSet);
    } catch (error) {
      errors.push(
        this.importResults.error({
          item: { scan: dir },
          message:
            `Could not read the official team list rules set directory "${dir}": ` +
            `${error instanceof Error ? error.message : String(error)}`,
        }),
      );
      return;
    }
    for (const filename of filenames) {
      try {
        const file = await this.files.readJson(dataDir, [
          TP_TEAMS_DIR,
          rulesSet,
          filename,
        ]);
        if (file === null) {
          continue;
        }
        for (const race of this.parser.parse(file.content)) {
          entries.push({ race, rulesSet });
        }
      } catch (error) {
        errors.push(
          this.importResults.error({
            item: { rulesSet, filename },
            message:
              `Could not parse official team list file "${filename}" in ` +
              `"${rulesSet}": ` +
              `${error instanceof Error ? error.message : String(error)}`,
          }),
        );
      }
    }
  }
}
