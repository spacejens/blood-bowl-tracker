import type { CompetitionType } from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

/** A name's trailing sequence number, e.g. the `8` of "Chaos Cup 8". */
const TRAILING_NUMBER = /(\d+)\s*$/u;

/** Options for {@link TpCompetitionGroupPrecedentService.nextName}. */
export interface NextNameOptions {
  /** The matched group's curated name. */
  groupName: string;
  /** TP's own raw name for the new competition, e.g. "tLoEGBBL Chaos Cup 9". */
  rawName: string;
  /** The stored names of every competition already in the group. */
  existingNames: readonly string[];
}

/**
 * Derives a brand-new competition's name and type from the competitions
 * already in its matched group. Pure and dependency-free.
 */
@Injectable()
export class TpCompetitionGroupPrecedentService {
  /**
   * `"<group name> <n>"`, where `n` is the trailing number of TP's own raw
   * name when it has one that no sibling already carries -- so competitions
   * imported out of order still get their real number. Otherwise `n` is the
   * highest existing number + 1, where a sibling name with no trailing number
   * counts as 1 (a track's first instalment is often unnumbered). With no
   * usable raw number and no sibling at all, the group name verbatim.
   *
   * The raw number is trusted as belonging to the matched group's own
   * numbering series -- it is not checked against a naming prefix, so a
   * group whose curated pattern accepts more than one distinct historical
   * numbering series could see a raw number from one series treated as
   * though it belonged to the other.
   */
  nextName({ groupName, rawName, existingNames }: NextNameOptions): string {
    const existingNumbers = existingNames.map(
      (name) => this.trailingNumber(name) ?? 1,
    );
    const rawNumber = this.trailingNumber(rawName);
    if (rawNumber !== undefined && !existingNumbers.includes(rawNumber)) {
      return `${groupName} ${rawNumber}`;
    }
    if (existingNumbers.length === 0) {
      return groupName;
    }
    return `${groupName} ${Math.max(...existingNumbers) + 1}`;
  }

  /**
   * The type every sibling shares, or undefined when they disagree or there
   * are none -- the caller then falls back to the date-span heuristic.
   */
  sharedType(types: readonly CompetitionType[]): CompetitionType | undefined {
    const [first, ...rest] = types;
    if (first === undefined) {
      return undefined;
    }
    return rest.every((type) => type === first) ? first : undefined;
  }

  /** A name's trailing sequence number, or undefined when it has none. */
  private trailingNumber(name: string): number | undefined {
    const match = TRAILING_NUMBER.exec(name);
    return match === null ? undefined : Number(match[1]);
  }
}
