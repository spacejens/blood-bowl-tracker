import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type { TpCompetitionImportResult } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ImportResultService,
  ImportRunnerService,
} from '@blood-bowl-tracker/import';
import type { TpMatch } from '@blood-bowl-tracker/parse-tp';
import { Inject, Injectable } from '@nestjs/common';

import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import type { RosterEntry } from '../source/roster-collection.service';
import { TpAwardsReaderService } from './tp-awards-reader.service';
import type { TpCompetitionSource } from './tp-competition-sources.service';

/** Options for {@link TpCompetitionsImportService.importCompetitions}. */
export interface ImportCompetitionsOptions {
  /** Each collected competition directory, by TP id. */
  competitionsByTpId: ReadonlyMap<number, TpCompetitionSource>;
  /** Every parsed match, by its competition's TP id. */
  matchesByCompetitionTpId: ReadonlyMap<number, TpMatch[]>;
  /** Every parsed roster file, tagged with the directory it was found in. */
  rosters: readonly RosterEntry[];
}

/** What importing every competition did, one result per stage. */
export interface CompetitionsImportOutcome {
  competitionResult: ImportResult;
  participationResult: ImportResult;
  trophyAwardsResult: ImportResult;
  /** TP ids of the competitions the server upserted. */
  importedTpIds: number[];
}

interface Tally {
  imported: number;
  errors: ImportError[];
}

type Stage = keyof TpCompetitionImportResult;

@Injectable()
export class TpCompetitionsImportService {
  constructor(
    @Inject(API_CLIENT) private readonly client: ApiClient,
    private readonly awardsReader: TpAwardsReaderService,
    private readonly importRunner: ImportRunnerService,
    private readonly importResults: ImportResultService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
  ) {}

  /**
   * Imports every collected competition through `tpCompetitions.import`,
   * one call each. Each call sends the tournament's TP id and name, every
   * parsed match's date, the era directory's name, the roster ids of the
   * roster files under the competition's directory (every registered team,
   * whether or not it played), and the directory's parsed awards. The
   * server upserts the competition, links those teams and records the
   * awards. Runs after the roster import, because linking a team and
   * awarding it a trophy both need its team era. Award files whose directory
   * no collected competition matches are reported, not dropped silently.
   */
  async importCompetitions({
    competitionsByTpId,
    matchesByCompetitionTpId,
    rosters,
  }: ImportCompetitionsOptions): Promise<CompetitionsImportOutcome> {
    const externalSystemName = this.externalSystemName.getTpSystemName();
    const tallies: Record<Stage, Tally> = {
      competition: { imported: 0, errors: [] },
      participation: { imported: 0, errors: [] },
      trophyAwards: { imported: 0, errors: [] },
    };
    const awardsByDirectory = await this.awardsReader.getAwardsByDirectory(
      tallies.trophyAwards.errors,
    );
    const rosterIdsByDirectory = this.rosterIdsByDirectory(rosters);
    const consumedDirectories = new Set<string>();
    const importedTpIds: number[] = [];

    for (const [tpId, source] of competitionsByTpId) {
      const directory = `${source.era}::${source.competition}`;
      consumedDirectories.add(directory);
      const outcome = await this.importRunner.recordUpsertResult({
        upsert: () =>
          this.client.tpCompetitions.import({
            tournament: { id: tpId, name: source.tournament.name },
            playedDates: (matchesByCompetitionTpId.get(tpId) ?? []).map(
              (match) => match.playedDate,
            ),
            era: source.era,
            participantRosterIds: rosterIdsByDirectory.get(directory) ?? [],
            awards: awardsByDirectory.get(directory) ?? [],
            externalSystemName,
          }),
        item: { competition: tpId },
        errors: tallies.competition.errors,
        buildErrorMessage: (err) =>
          `Failed to import competition ${tpId}: ${err instanceof Error ? err.message : String(err)}`,
      });
      if (outcome === undefined) {
        continue;
      }
      for (const stage of Object.keys(tallies) as Stage[]) {
        tallies[stage].imported += outcome[stage].imported;
        tallies[stage].errors.push(...outcome[stage].errors);
      }
      if (outcome.competition.imported > 0) {
        importedTpIds.push(tpId);
      }
    }

    for (const [directory, awards] of awardsByDirectory) {
      if (!consumedDirectories.has(directory) && awards.length > 0) {
        tallies.trophyAwards.errors.push(
          this.importResults.error({
            item: { directory },
            message: `Skipped ${awards.length} award row(s) in "${directory}": no imported competition matches that directory.`,
          }),
        );
      }
    }

    return {
      competitionResult: this.importResults.result(tallies.competition),
      participationResult: this.importResults.result(tallies.participation),
      trophyAwardsResult: this.importResults.result(tallies.trophyAwards),
      importedTpIds,
    };
  }

  /**
   * Each competition directory's registered teams: the TP roster ids of the
   * roster files found under it, deduped in first-seen order.
   */
  private rosterIdsByDirectory(
    rosters: readonly RosterEntry[],
  ): Map<string, number[]> {
    const byDirectory = new Map<string, Set<number>>();
    for (const entry of rosters) {
      const directory = `${entry.era}::${entry.competition}`;
      const ids = byDirectory.get(directory) ?? new Set<number>();
      ids.add(entry.roster.id);
      byDirectory.set(directory, ids);
    }
    return new Map(
      [...byDirectory].map(([directory, ids]) => [directory, [...ids]]),
    );
  }
}
