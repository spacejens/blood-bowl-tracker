import { Injectable } from '@nestjs/common';

import { ImportBblConfigService } from '../config/import-bbl-config.service';

@Injectable()
export class MatchMergeConfigService {
  constructor(private readonly config: ImportBblConfigService) {}

  /**
   * The BBL match-id pairs to merge into a single match, supplied via the
   * optional matchMerges key in import-bbl-config.json5 as an array of
   * two-element string arrays, e.g. [["1061","1062"],["1311","1312"]]. Each
   * pair's two source matches (BBL cannot store a >2-team match, so a
   * four-team final is registered as two two-team rows) are folded into one DB
   * match downstream. Unset or empty means no merges are configured — this is
   * not an error, since it only ever applies to a handful of known matches.
   */
  getMerges(): [string, string][] {
    const raw = this.config.get<unknown>('matchMerges');
    if (raw === undefined) {
      return [];
    }

    if (!Array.isArray(raw)) {
      throw new Error(
        'matchMerges in import-bbl-config.json5 must be an array of ' +
          '[id, id] match-id pairs.',
      );
    }

    const pairs = raw.map((entry, index) => this.parsePair(entry, index));

    const seen = new Map<string, number>();
    pairs.forEach(([a, b], index) => {
      for (const id of [a, b]) {
        const existing = seen.get(id);
        if (existing !== undefined) {
          throw new Error(
            `BBL_MATCH_MERGES: match id ${id} appears in more than one pair (indices ${existing} and ${index}).`,
          );
        }
        seen.set(id, index);
      }
    });

    return pairs;
  }

  private parsePair(entry: unknown, index: number): [string, string] {
    if (!Array.isArray(entry) || entry.length !== 2) {
      throw new Error(
        `BBL_MATCH_MERGES[${index}] must be a 2-element array of match ids.`,
      );
    }
    const [a, b] = entry as unknown[];
    if (
      typeof a !== 'string' ||
      a.trim() === '' ||
      typeof b !== 'string' ||
      b.trim() === ''
    ) {
      throw new Error(
        `BBL_MATCH_MERGES[${index}] must contain two non-empty string match ids.`,
      );
    }
    if (a === b) {
      throw new Error(
        `BBL_MATCH_MERGES[${index}]: a pair cannot contain the same id twice (${a}).`,
      );
    }
    return [a, b];
  }
}
