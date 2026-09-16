import type { ImportError } from '@blood-bowl-tracker/import';
import { ImportResultService } from '@blood-bowl-tracker/import';
import type { TpSkillMaster } from '@blood-bowl-tracker/parse-tp';
import { SkillMasterNamesParserService } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import { TpSourceReader } from './tp-source-reader';

const SKILL_MASTER_FILE_TYPES = ['rosters', 'match'] as const;

/**
 * Builds the `skillMasterId -> skill name` lookup the positions' skills import
 * needs, by scanning every downloaded `rosters` and `match` source file once.
 *
 * TP's per-rules-set template (`rosters_masters`) carries ids only, but real
 * team rosters and match snapshots embed the skill's full name wherever a
 * skill appears -- and, on BB2025 skills, TP's `isElite` marker, which appears
 * nowhere else in the mirror at all -- so the mirror already downloaded
 * answers almost every id, and coverage improves by itself as `download-tp`
 * pulls more history. An id no file explains stays unresolved and is reported
 * by the skills import, not here.
 *
 * Uses `TpSourceReader.filesOfType` (not the unfiltered `files()`) so only
 * `rosters` and `match` files are read and JSON-parsed -- the only two file
 * types that ever carry a `skillMaster` object. This is a correctness/clarity
 * filter, not a meaningful performance win: `awards`, `inscriptions`, and
 * `tournament` files together are only ~3% of a real mirror's bytes, so
 * excluding them barely reduces the actual work. `rosters` and `match` --
 * the two types this still reads in full -- are ~97% of the mirror (`match`
 * alone ~82%), and RosterCollectionService already makes its own full pass
 * over the same files for a different purpose, so this remains a genuine
 * second full read-and-parse of nearly the whole mirror. Folding this scan
 * into RosterCollectionService's existing pass would be the real fix for
 * that double-scan cost; left as a follow-up, out of scope here.
 *
 * Mirrors RosterCollectionService.collect: one streaming pass, a per-file
 * failure recorded and skipped, a scan failure recorded with whatever was
 * collected so far returned.
 */
@Injectable()
export class SkillMasterNameCollectionService {
  constructor(
    private readonly sourceReader: TpSourceReader,
    private readonly parser: SkillMasterNamesParserService,
    private readonly importResults: ImportResultService,
  ) {}

  async collect(errors: ImportError[]): Promise<Map<number, TpSkillMaster>> {
    let masters = new Map<number, TpSkillMaster>();
    try {
      for await (const file of this.sourceReader.filesOfType(
        SKILL_MASTER_FILE_TYPES,
      )) {
        try {
          // Passing the running accumulator back into the parser reuses its
          // OR-accumulation logic across files, the same way it already
          // OR-accumulates across embeddings within one file.
          masters = this.parser.extract(file.content, masters);
        } catch (error) {
          errors.push(
            this.importResults.error({
              item: {
                era: file.era,
                competition: file.competition,
                filename: file.filename,
              },
              message:
                `Could not read skill names from "${file.filename}" in ` +
                `"${file.era}/${file.competition}": ` +
                `${error instanceof Error ? error.message : String(error)}`,
            }),
          );
        }
      }
    } catch (error) {
      errors.push(
        this.importResults.error({
          item: { scan: 'skill names' },
          message:
            'Could not complete the skill name scan: ' +
            `${error instanceof Error ? error.message : String(error)}`,
        }),
      );
    }
    return masters;
  }
}
