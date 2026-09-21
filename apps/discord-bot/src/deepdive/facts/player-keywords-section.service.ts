import type { PositionKeyword } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';

interface BuildPlayerKeywordsOptions {
  /** Every keyword the player's position carries, across all rules sets. */
  rows: PositionKeyword[];
  /** The one rules set that applies to this player's era. */
  rulesSetId: number;
}

/**
 * The keywords a player carries, as one unprefixed line:
 * `Keywords: Goblin, Undead`.
 *
 * A player has no keywords of their own -- these are their position's, the
 * same relationship the deepdive already has to the position's
 * characteristic baseline. Only the resolved rules set's rows are shown: the
 * player belongs to exactly one era and therefore one rules set, and naming
 * it again here would repeat what the characteristics line above already
 * implies.
 *
 * Zero lines when that rules set records none, with no placeholder -- a
 * pre-BB2025 player commonly has no keywords recorded (species keywords are
 * BB2025-only), but not always: a BB2020 or DB2021 player recruited from a
 * Big Guy position still gets a "Keywords: Big Guy" line, so this cannot be
 * gated on the rules set itself, only on the resolved row set being empty.
 */
@Injectable()
export class PlayerKeywordsSectionService {
  build({ rows, rulesSetId }: BuildPlayerKeywordsOptions): string[] {
    const names = rows
      .filter((row) => row.rulesSetId === rulesSetId)
      .map((row) => row.keywordName);
    if (names.length === 0) {
      return [];
    }
    return [`Keywords: ${names.join(', ')}`];
  }
}
