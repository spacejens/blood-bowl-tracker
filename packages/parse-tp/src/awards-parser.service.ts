import { Injectable } from '@nestjs/common';
import { z } from 'zod';

/**
 * One award handed out in a TP competition, from
 * `awards_<slug>_awards.json`.
 *
 * `awardType` is TP's raw numeric code (1/2/3 placements; 100 and 200 are the
 * same Best Stunty / Wooden Spoon pair under fourth- and third-era
 * numbering). It is NOT globally unique per trophy -- the same code means a
 * different trophy in a different competition group -- so classification is
 * deliberately left to the importer; this parser reports whatever the file
 * says. `name` is present only on the stunty/spoon entries, where it is
 * exactly "Best Stunty" or "Wooden Spoon" and is the only thing separating
 * the two within one file.
 *
 * `rosterId` comes from `inscription.roster.id`. The award entry's coach and
 * player identity fields (`inscription.player`, `inscription.players`,
 * `inscription.coachRank`) are deliberately not carried: they are a less
 * complete duplicate of data the inscriptions import already covers, and TP
 * records no individual player awards at all.
 */
export interface TpAward {
  id: number;
  awardType: number;
  name?: string;
  rosterId: number;
}

const TpAwardEntrySchema = z.object({
  id: z.number(),
  awardType: z.number(),
  name: z.string().optional(),
  inscription: z.object({ roster: z.object({ id: z.number() }) }),
});

/** The file is an object keyed by TP's category id, each value an array. */
const TpAwardsFileSchema = z.record(z.string(), z.array(TpAwardEntrySchema));

@Injectable()
export class AwardsParserService {
  /**
   * Validate and flatten a parsed TP awards JSON body into one list of
   * awards, in category order then file order. Extra fields are allowed and
   * dropped. Throws an Error whose message names the failing field on any
   * shape mismatch. A file with no categories, or with only empty ones,
   * yields an empty list rather than an error -- TP writes those.
   */
  parse(content: unknown): TpAward[] {
    const result = TpAwardsFileSchema.safeParse(content);
    if (!result.success) {
      throw new Error(
        `Invalid TP awards JSON: ${result.error.issues
          .map(
            (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
          )
          .join('; ')}`,
      );
    }
    return Object.values(result.data).flatMap((entries) =>
      entries.map((entry) => ({
        id: entry.id,
        awardType: entry.awardType,
        ...(entry.name === undefined ? {} : { name: entry.name }),
        rosterId: entry.inscription.roster.id,
      })),
    );
  }
}
