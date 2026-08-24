import { ConfigErrorMessageService } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { EraConfigService } from '../eras/era-config.service';
import { matchMergePairSchema } from './match-config.schema';

export interface MatchMergePair {
  firstMatchId: string;
  secondMatchId: string;
}

@Injectable()
export class MatchMergeConfigService {
  constructor(
    private readonly eraConfig: EraConfigService,
    private readonly messages: ConfigErrorMessageService,
  ) {}

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
        const location = `BBL_ERAS[${eraIndex}].matches.merges[${pairIndex}]`;
        const parsed = matchMergePairSchema.safeParse(entry);
        if (!parsed.success) {
          throw new Error(this.messages.format(location, parsed.error));
        }
        const [firstMatchId, secondMatchId] = parsed.data;
        if (firstMatchId === secondMatchId) {
          throw new Error(
            `${location}: a pair cannot contain the same id twice (${firstMatchId}).`,
          );
        }
        for (const id of [firstMatchId, secondMatchId]) {
          const existing = seenAt.get(id);
          if (existing !== undefined) {
            throw new Error(
              `BBL_ERAS: match id ${id} appears in more than one pair (${existing} and ${location}).`,
            );
          }
          seenAt.set(id, location);
        }
        pairs.push({ firstMatchId, secondMatchId });
      });
    });

    return pairs;
  }
}
