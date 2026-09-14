import { Injectable } from '@nestjs/common';

/** BBL appends a duo star's partner in parentheses: "Dolfar (& Grak)". */
const PARENTHETICAL = /\s*\([^)]*\)\s*$/;

/** Every apostrophe-like character the two sources mix freely. */
const APOSTROPHES = /[‘’ʼ`']/g;

/** Every quote-like character the two sources mix freely. */
const QUOTES = /[“”"]/g;

/** One `{ system, id }` external-id reference, as a source names it. */
export interface ExternalIdRefLike {
  system: string;
  id: string;
}

/** One external id a star position carries, as the database stores it. */
export interface OwnedExternalId {
  systemName: string;
  externalId: string;
}

/**
 * The single rule this tool uses for "are these two spellings the same star?"
 * BBL and TP disagree routinely about apostrophes, quote style, case and a
 * duo star's parenthesised partner, and `star-players.json5` exists precisely
 * to pin those pairs — so a raw panel that compared names verbatim would call
 * almost every duo star a mismatch.
 *
 * Deliberately its own service rather than repeated in each renderer, so no
 * caller invents its own normalisation. Pure and dependency-free, so specs
 * may inject it as a real provider.
 *
 * `tools/import-bbl`'s and `tools/import-tp`'s own name handling is
 * deliberately NOT reused: their reading of these names is part of what the
 * report exists to check.
 */
@Injectable()
export class StarPlayerNameMatcherService {
  /** Lower-cased, punctuation-folded, parenthetical-stripped form. */
  normalize(name: string): string {
    return name
      .replace(PARENTHETICAL, '')
      .replace(APOSTROPHES, "'")
      .replace(QUOTES, '"')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

  /** True when two source spellings name the same star. */
  matchesName(a: string, b: string): boolean {
    return this.normalize(a) === this.normalize(b);
  }

  /** Does this external-id reference equal one of the star's own ids? */
  refMatches(
    ref: ExternalIdRefLike,
    ownedIds: readonly OwnedExternalId[],
  ): boolean {
    return ownedIds.some(
      (row) => row.systemName === ref.system && row.externalId === ref.id,
    );
  }
}
