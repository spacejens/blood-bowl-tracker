import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type {
  TpBracketMatch,
  TpMatchImportResult,
} from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ImportResultService,
  ImportRunnerService,
} from '@blood-bowl-tracker/import';
import type { TpMatch } from '@blood-bowl-tracker/parse-tp';
import { Inject, Injectable } from '@nestjs/common';

import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { TpSourceReader } from '../source/tp-source-reader';

/** Options for {@link TpMatchFilesImportService.importMatchFiles}. */
export interface ImportMatchFilesOptions {
  /** Each imported competition's directory, by TP id. */
  competitionsByTpId: ReadonlyMap<number, { era: string; competition: string }>;
  /** Each imported competition's database id, by TP id. */
  competitionIdsByTpId: ReadonlyMap<number, number>;
  /** Every parsed match, by competition database id. */
  matchesByCompetitionId: ReadonlyMap<number, TpMatch[]>;
}

/** What importing every match file did, one result per stage. */
export interface MatchFilesImportOutcome {
  matchResult: ImportResult;
  participationResult: ImportResult;
  eventsResult: ImportResult;
  outcomeResult: ImportResult;
}

/** The competition a directory's match files belong to. */
interface CompetitionOfFiles {
  tpId: number;
  bracket: TpBracketMatch[];
  matchIds: Set<number>;
}

interface Tally {
  imported: number;
  errors: ImportError[];
}

type Stage = keyof TpMatchImportResult;

@Injectable()
export class TpMatchFilesImportService {
  constructor(
    @Inject(API_CLIENT) private readonly client: ApiClient,
    private readonly sourceReader: TpSourceReader,
    private readonly importRunner: ImportRunnerService,
    private readonly importResults: ImportResultService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
  ) {}

  /**
   * Imports every match file through `tpMatches.import`: its raw content,
   * its competition's TP id, and that competition's whole bracket (every
   * parsed match's phase position, teams and winner), which classifying a
   * playoff match needs. The server upserts the match, links its teams,
   * imports its events and resolves its outcome. Files are streamed again
   * rather than kept from the competitions scan, so only one raw match is
   * held at a time. A file under a competition that was not imported, or
   * that did not parse during the competitions scan, was already reported
   * there and is skipped.
   */
  async importMatchFiles(
    options: ImportMatchFilesOptions,
  ): Promise<MatchFilesImportOutcome> {
    const externalSystemName = this.externalSystemName.getTpSystemName();
    const competitionsByDirectory = this.competitionsByDirectory(options);
    const tallies: Record<Stage, Tally> = {
      match: { imported: 0, errors: [] },
      participation: { imported: 0, errors: [] },
      events: { imported: 0, errors: [] },
      outcome: { imported: 0, errors: [] },
    };

    try {
      for await (const file of this.sourceReader.filesOfType('match')) {
        const competition = competitionsByDirectory.get(
          `${file.era}::${file.competition}`,
        );
        const matchId = this.matchIdOf(file.content);
        if (
          competition === undefined ||
          matchId === undefined ||
          !competition.matchIds.has(matchId)
        ) {
          continue;
        }
        const outcome = await this.importRunner.recordUpsertResult({
          upsert: () =>
            this.client.tpMatches.import({
              match: file.content,
              bracket: competition.bracket,
              competitionTpId: competition.tpId,
              externalSystemName,
            }),
          item: { match: matchId, competition: competition.tpId },
          errors: tallies.match.errors,
          buildErrorMessage: (err) =>
            `Failed to import match ${matchId}: ${err instanceof Error ? err.message : String(err)}`,
        });
        if (outcome !== undefined) {
          for (const stage of Object.keys(tallies) as Stage[]) {
            tallies[stage].imported += outcome[stage].imported;
            tallies[stage].errors.push(...outcome[stage].errors);
          }
        }
      }
    } catch (error) {
      tallies.match.errors.push(
        this.importResults.error({
          item: { scan: 'match files' },
          message: `Could not complete the match file scan: ${error instanceof Error ? error.message : String(error)}`,
        }),
      );
    }

    return {
      matchResult: this.importResults.result(tallies.match),
      participationResult: this.importResults.result(tallies.participation),
      eventsResult: this.importResults.result(tallies.events),
      outcomeResult: this.importResults.result(tallies.outcome),
    };
  }

  /** Each imported competition, keyed by its `${era}::${competition}` directory. */
  private competitionsByDirectory({
    competitionsByTpId,
    competitionIdsByTpId,
    matchesByCompetitionId,
  }: ImportMatchFilesOptions): Map<string, CompetitionOfFiles> {
    const byDirectory = new Map<string, CompetitionOfFiles>();
    for (const [tpId, entry] of competitionsByTpId) {
      const competitionId = competitionIdsByTpId.get(tpId);
      if (competitionId === undefined) {
        continue;
      }
      const matches = matchesByCompetitionId.get(competitionId) ?? [];
      byDirectory.set(`${entry.era}::${entry.competition}`, {
        tpId,
        bracket: matches.map((match) => ({
          id: match.id,
          phaseOrder: match.phaseOrder,
          round: match.round,
          homeTeamTpId: match.homeTeamTpId,
          awayTeamTpId: match.awayTeamTpId,
          winner: match.winner,
        })),
        matchIds: new Set(matches.map((match) => match.id)),
      });
    }
    return byDirectory;
  }

  /** A raw match file's TP match id, when it has one. */
  private matchIdOf(content: unknown): number | undefined {
    return typeof content === 'object' &&
      content !== null &&
      'matchId' in content &&
      typeof content.matchId === 'number'
      ? content.matchId
      : undefined;
  }
}
