import type { CompetitionType } from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

/** A name's trailing sequence number, e.g. the `8` of "Chaos Cup 8". */
const TRAILING_NUMBER = /(\d+)\s*$/u;

/** Options for {@link TpCompetitionGroupPrecedentService.nextName}. */
export interface NextNameOptions {
  /** The matched group's curated name. */
  groupName: string;
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
   * `"<group name> <highest existing number + 1>"`, where a sibling name
   * with no trailing number counts as 1 (a track's first instalment is often
   * unnumbered). With no sibling at all, the group name verbatim.
   */
  nextName({ groupName, existingNames }: NextNameOptions): string {
    if (existingNames.length === 0) {
      return groupName;
    }
    const numbers = existingNames.map((name) => {
      const match = TRAILING_NUMBER.exec(name);
      return match === null ? 1 : Number(match[1]);
    });
    return `${groupName} ${Math.max(...numbers) + 1}`;
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
}
