import type { ImportError } from '@blood-bowl-tracker/import';
import { makeImportError } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { BblSourceReader } from '../source/bbl-source-reader';
import { CompetitionStandingsPageParser } from './competition-standings-page-parser';

const STANDINGS_PAGE_TYPE = 'se';

@Injectable()
export class BblCompetitionStandingsReaderService {
  private cache: Map<string, Set<string>> | undefined;

  constructor(
    private readonly sourceReader: BblSourceReader,
    private readonly parser: CompetitionStandingsPageParser,
  ) {}

  /**
   * Read every competition's registered teams in a single pass over the se
   * standings pages, keyed by competition BBL id (the `s` param). Each page
   * lists every team registered for that competition — including teams with a
   * 0-0 record that played no matches — so this is an independent source of
   * competition membership alongside match participation. The first page seen
   * per `s` wins if the mirror holds duplicates. Per-page parse failures are
   * recorded and skipped. The result is memoized on the instance so repeated
   * calls within a process reuse the first walk.
   */
  async getRegisteredTeamIdsByCompetitionId(
    errors: ImportError[],
  ): Promise<Map<string, Set<string>>> {
    if (this.cache) {
      return this.cache;
    }
    const teamIdsByCompetitionId = new Map<string, Set<string>>();
    for await (const page of this.sourceReader.pages(STANDINGS_PAGE_TYPE)) {
      const competitionId = page.params.s;
      if (
        competitionId === undefined ||
        teamIdsByCompetitionId.has(competitionId)
      ) {
        continue;
      }
      try {
        teamIdsByCompetitionId.set(
          competitionId,
          this.parser.extractRegisteredTeamIds(page, errors),
        );
      } catch (error) {
        errors.push(
          makeImportError({
            item: { page: page.params },
            message: `Failed to parse standings page ${JSON.stringify(page.params)}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          }),
        );
      }
    }
    this.cache = teamIdsByCompetitionId;
    return teamIdsByCompetitionId;
  }
}
