import type { ImportError } from '@blood-bowl-tracker/import';
import { ImportResultService } from '@blood-bowl-tracker/import';
import { SkillMasterNamesParserService } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import { TpSourceReader } from './tp-source-reader';

/**
 * Builds the `skillMasterId -> skill name` lookup the positions' skills import
 * needs, by scanning every downloaded source file once.
 *
 * TP's per-rules-set template (`rosters_masters`) carries ids only, but real
 * team rosters and match snapshots embed the skill's full name wherever a
 * skill appears -- so the mirror already downloaded answers almost every id,
 * and coverage improves by itself as `download-tp` pulls more history. An id
 * no file explains stays unresolved and is reported by the skills import, not
 * here.
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

  async collect(errors: ImportError[]): Promise<Map<number, string>> {
    const names = new Map<number, string>();
    try {
      for await (const file of this.sourceReader.files()) {
        try {
          for (const [id, name] of this.parser.extract(file.content)) {
            names.set(id, name);
          }
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
    return names;
  }
}
