import type { ImportError } from '@blood-bowl-tracker/import';
import { ImportResultService } from '@blood-bowl-tracker/import';
import type { TpAward } from '@blood-bowl-tracker/parse-tp';
import { AwardsParserService } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import { TpSourceReader } from '../source/tp-source-reader';

const AWARDS_FILE_TYPE = 'awards';

@Injectable()
export class TpAwardsReaderService {
  constructor(
    private readonly sourceReader: TpSourceReader,
    private readonly awardsParser: AwardsParserService,
    private readonly importResults: ImportResultService,
  ) {}

  /**
   * Every competition directory's parsed awards, keyed by
   * `${era}::${competition}` -- the same directory key
   * TpCompetitionsImportService groups its competitions by, which is how an
   * award is later matched to the competition it belongs to (award files
   * carry no tournament id).
   *
   * A competition with no awards file is simply absent from the map: TP only
   * writes one for a finished competition, so that is normal, not an error. A
   * malformed file records an error and costs that one competition its
   * awards, nothing more. A throw from the directory walk itself (e.g. a
   * missing era directory) is recorded and whatever was collected so far is
   * returned -- the same shape TpCompetitionsImportService.collectGroups
   * uses.
   */
  async getAwardsByDirectory(
    errors: ImportError[],
  ): Promise<Map<string, TpAward[]>> {
    const awardsByDirectory = new Map<string, TpAward[]>();
    try {
      for await (const file of this.sourceReader.filesOfType(
        AWARDS_FILE_TYPE,
      )) {
        try {
          const key = `${file.era}::${file.competition}`;
          // Accumulate rather than overwrite: if a competition directory ever
          // held two awards_*.json files, overwriting would silently drop the
          // first file's awards -- the same silent data-loss bug
          // TpCompetitionsImportService's matchesByCompetitionId accumulation
          // guards against.
          awardsByDirectory.set(key, [
            ...(awardsByDirectory.get(key) ?? []),
            ...this.awardsParser.parse(file.content),
          ]);
        } catch (error) {
          errors.push(
            this.importResults.error({
              item: {
                era: file.era,
                competition: file.competition,
                filename: file.filename,
              },
              message:
                `Could not parse awards file "${file.filename}" in ` +
                `"${file.era}/${file.competition}": ` +
                `${error instanceof Error ? error.message : String(error)}`,
            }),
          );
        }
      }
    } catch (error) {
      errors.push(
        this.importResults.error({
          item: { scan: 'awards files' },
          message:
            'Could not complete the awards file scan: ' +
            `${error instanceof Error ? error.message : String(error)}`,
        }),
      );
    }
    return awardsByDirectory;
  }
}
