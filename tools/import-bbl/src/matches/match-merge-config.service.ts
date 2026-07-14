import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MatchMergeConfigService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * The BBL match-id pairs to merge into a single match, supplied via the
   * optional BBL_MATCH_MERGES environment variable as a JSON array of
   * two-element string arrays, e.g. [["1061","1062"],["1311","1312"]]. Each
   * pair's two source matches (BBL cannot store a >2-team match, so a
   * four-team final is registered as two two-team rows) are folded into one DB
   * match downstream. Unset or empty means no merges are configured — this is
   * not an error, since it only ever applies to a handful of known matches.
   */
  getMerges(): [string, string][] {
    const raw = this.configService.get<string>('BBL_MATCH_MERGES');
    if (!raw || raw.trim() === '') {
      return [];
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new Error(
        `BBL_MATCH_MERGES is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }

    if (!Array.isArray(parsed)) {
      throw new Error(
        'BBL_MATCH_MERGES must be a JSON array of [id, id] match-id pairs.',
      );
    }

    const pairs = parsed.map((entry, index) => this.parsePair(entry, index));

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
