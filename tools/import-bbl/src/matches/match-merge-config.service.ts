import { Injectable } from '@nestjs/common';

import { EraConfigService } from '../eras/era-config.service';

export interface MatchMergePair {
  firstMatchId: string;
  secondMatchId: string;
}

@Injectable()
export class MatchMergeConfigService {
  constructor(private readonly eraConfig: EraConfigService) {}

  /**
   * The BBL match-id pairs to merge into a single match, gathered from each
   * era's optional matches.merges list and flattened into one
   * MatchMergePair[]. Each pair's two source matches (BBL cannot store a
   * >2-team match, so a four-team final is registered as two two-team rows)
   * are folded into one DB match downstream. No configured merges anywhere is
   * not an error. A match id may appear in only one pair across all eras.
   */
  getMerges(): MatchMergePair[] {
    const eras = this.eraConfig.getEras();
    const pairs: MatchMergePair[] = [];
    const seenAt = new Map<string, string>();

    eras.forEach((era, eraIndex) => {
      const merges = era.matches?.merges;
      if (merges === undefined) {
        return;
      }
      merges.forEach((entry, pairIndex) => {
        const pair = this.parsePair(entry, eraIndex, pairIndex);
        const location = `BBL_ERAS[${eraIndex}].matches.merges[${pairIndex}]`;
        for (const id of [pair.firstMatchId, pair.secondMatchId]) {
          const existing = seenAt.get(id);
          if (existing !== undefined) {
            throw new Error(
              `BBL_ERAS: match id ${id} appears in more than one pair (${existing} and ${location}).`,
            );
          }
          seenAt.set(id, location);
        }
        pairs.push(pair);
      });
    });

    return pairs;
  }

  private parsePair(
    entry: unknown,
    eraIndex: number,
    pairIndex: number,
  ): MatchMergePair {
    const location = `BBL_ERAS[${eraIndex}].matches.merges[${pairIndex}]`;
    if (!Array.isArray(entry) || entry.length !== 2) {
      throw new Error(`${location} must be a 2-element array of match ids.`);
    }
    const [a, b] = entry as unknown[];
    if (
      typeof a !== 'string' ||
      a.trim() === '' ||
      typeof b !== 'string' ||
      b.trim() === ''
    ) {
      throw new Error(
        `${location} must contain two non-empty string match ids.`,
      );
    }
    if (a === b) {
      throw new Error(
        `${location}: a pair cannot contain the same id twice (${a}).`,
      );
    }
    return { firstMatchId: a, secondMatchId: b };
  }
}
