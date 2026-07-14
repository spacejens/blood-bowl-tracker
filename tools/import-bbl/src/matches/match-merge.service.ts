import type { ImportError } from '@blood-bowl-tracker/import';
import { makeImportError } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { BblMatchListReaderService } from './bbl-match-list-reader.service';
import { MatchMergeConfigService } from './match-merge-config.service';

export interface MatchMergeResolution {
  /** For a resolved pair member (both members), the pair's primary bblId. */
  primaryBblIdByBblId: ReadonlyMap<string, string>;
  /** The other member of bblId's resolved pair, or undefined if unpaired/unresolved. */
  partnerBblId(bblId: string): string | undefined;
  /** True if bblId is the designated primary of a resolved pair. */
  isPrimary(bblId: string): boolean;
  /** True if bblId is the non-primary (secondary) member of a resolved pair. */
  isSecondary(bblId: string): boolean;
  /** Earliest of the pair's two dates for a resolved member; rawDate otherwise. */
  effectivePlayedAt(bblId: string, rawDate: Date): Date;
}

/**
 * Resolves the configured BBL_MATCH_MERGES pairs against the actual match list
 * once per import run. A pair is merged only when both of its ids appear in the
 * same competition's match list; the numerically-lower id is the primary, and
 * the pair's canonical playedAt is the earliest of the two source dates.
 *
 * Injected into BblMatchesImportService, BblTeamParticipationImportService, and
 * BblMatchEventsImportService. The resolution is memoized on the instance, so
 * an unresolvable-pair error is recorded exactly once (into whichever caller
 * resolves first) even though all three consumers call resolve().
 */
@Injectable()
export class MatchMergeService {
  private cache: MatchMergeResolution | undefined;

  constructor(
    private readonly matchListReader: BblMatchListReaderService,
    private readonly mergeConfig: MatchMergeConfigService,
  ) {}

  async resolve(errors: ImportError[]): Promise<MatchMergeResolution> {
    if (this.cache) {
      return this.cache;
    }

    const merges = this.mergeConfig.getMerges();
    const matchesByCompetitionId =
      await this.matchListReader.getMatchesByCompetitionId(errors);

    const locationByBblId = new Map<
      string,
      { competitionId: string; date: Date }
    >();
    for (const [competitionId, matches] of matchesByCompetitionId) {
      for (const match of matches) {
        locationByBblId.set(match.bblId, { competitionId, date: match.date });
      }
    }

    const primaryBblIdByBblId = new Map<string, string>();
    const partnerByBblId = new Map<string, string>();
    const effectiveByBblId = new Map<string, Date>();

    for (const [a, b] of merges) {
      const la = locationByBblId.get(a);
      const lb = locationByBblId.get(b);
      if (!la || !lb || la.competitionId !== lb.competitionId) {
        errors.push(
          makeImportError({
            item: { matches: [a, b] },
            message: `Skipping match merge for pair [${a}, ${b}]: both match ids must appear in the same competition's match list, but they do not. Importing them as independent matches.`,
          }),
        );
        continue;
      }
      const primary = Number(a) <= Number(b) ? a : b;
      const earliest = la.date <= lb.date ? la.date : lb.date;
      primaryBblIdByBblId.set(a, primary);
      primaryBblIdByBblId.set(b, primary);
      partnerByBblId.set(a, b);
      partnerByBblId.set(b, a);
      effectiveByBblId.set(a, earliest);
      effectiveByBblId.set(b, earliest);
    }

    this.cache = {
      primaryBblIdByBblId,
      partnerBblId: (bblId) => partnerByBblId.get(bblId),
      isPrimary: (bblId) =>
        partnerByBblId.has(bblId) && primaryBblIdByBblId.get(bblId) === bblId,
      isSecondary: (bblId) =>
        partnerByBblId.has(bblId) && primaryBblIdByBblId.get(bblId) !== bblId,
      effectivePlayedAt: (bblId, rawDate) =>
        effectiveByBblId.get(bblId) ?? rawDate,
    };
    return this.cache;
  }
}
