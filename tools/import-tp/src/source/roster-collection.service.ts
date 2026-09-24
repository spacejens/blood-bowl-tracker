import type { ImportError } from '@blood-bowl-tracker/import';
import { ImportResultService } from '@blood-bowl-tracker/import';
import type { TpRoster } from '@blood-bowl-tracker/parse-tp';
import { RosterParserService } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import { TpSourceReader } from './tp-source-reader';

/**
 * One parsed roster file, tagged with the era and competition directories it
 * was found in. The competition slug is the per-competition team-membership
 * signal for the TP competition import (a roster file only ever appears
 * under the competition directories its team actually played in). `content`
 * is the file's JSON exactly as read: the roster import sends it to the
 * server unparsed, which does its own parsing.
 */
export interface RosterEntry {
  roster: TpRoster;
  era: string;
  competition: string;
  content: unknown;
}

@Injectable()
export class RosterCollectionService {
  constructor(
    private readonly sourceReader: TpSourceReader,
    private readonly rosterParser: RosterParserService,
    private readonly importResults: ImportResultService,
  ) {}

  /**
   * Single streaming pass over every source file, parsing each `rosters` file
   * into a `TpRoster` tagged with its era. A per-file parse failure is
   * recorded and skipped; a throw from files() is recorded and the rosters
   * collected so far returned -- mirroring TpCoachesImportService.collectCoaches.
   * Called once from main.ts and the resulting list shared by the roster
   * import, the competition import and the roster player facts, so a bad
   * file is scanned and reported once rather than independently by each of
   * them.
   */
  async collect(errors: ImportError[]): Promise<RosterEntry[]> {
    const rosters: RosterEntry[] = [];
    try {
      for await (const file of this.sourceReader.files()) {
        if (file.type !== 'rosters') {
          continue;
        }
        try {
          rosters.push({
            roster: this.rosterParser.parse(file.content),
            era: file.era,
            competition: file.competition,
            content: file.content,
          });
        } catch (error) {
          errors.push(
            this.importResults.error({
              item: {
                era: file.era,
                competition: file.competition,
                filename: file.filename,
              },
              message:
                `Could not parse rosters file "${file.filename}" in ` +
                `"${file.era}/${file.competition}": ` +
                `${error instanceof Error ? error.message : String(error)}`,
            }),
          );
        }
      }
    } catch (error) {
      errors.push(
        this.importResults.error({
          item: { scan: 'rosters files' },
          message:
            'Could not complete the rosters file scan: ' +
            `${error instanceof Error ? error.message : String(error)}`,
        }),
      );
    }
    return rosters;
  }
}
