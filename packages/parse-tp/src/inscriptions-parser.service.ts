import { Injectable } from '@nestjs/common';
import { z } from 'zod';

/**
 * One registered coach extracted from a TP
 * `inscriptions_<slug>_inscriptions.json` file. `id` is TP's own stable
 * internal account GUID (identical for the same coach across every competition
 * and era). `nafNumber` is present for most coaches but genuinely absent for
 * some (no NAF link) — hence optional.
 */
export interface TpCoach {
  id: string;
  name: string;
  nafNumber?: number;
}

const InscriptionEntrySchema = z.object({
  player: z.object({
    id: z.string(),
    userNameToShow: z.string(),
    nafNumber: z.number().optional(),
  }),
});

// An inscriptions file is an object keyed by category id (a string), each
// value an array of registration entries. Extra fields on the entry and the
// player object are allowed and dropped (zod's default non-strict parsing).
const InscriptionsSchema = z.record(
  z.string(),
  z.array(InscriptionEntrySchema),
);

@Injectable()
export class InscriptionsParserService {
  /**
   * Validate and flatten a parsed TP inscriptions JSON body into one flat
   * `TpCoach[]` across every category. `name` is `player.userNameToShow`
   * trimmed. Duplicate ids across categories are left in place — deduping is
   * the importer's job. Throws an Error whose message names the failing field
   * on any shape mismatch.
   */
  parseCoaches(content: unknown): TpCoach[] {
    const result = InscriptionsSchema.safeParse(content);
    if (!result.success) {
      throw new Error(
        `Invalid TP inscriptions JSON: ${result.error.issues
          .map(
            (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
          )
          .join('; ')}`,
      );
    }
    return Object.values(result.data).flatMap((entries) =>
      entries.map((entry) => {
        const coach: TpCoach = {
          id: entry.player.id,
          name: entry.player.userNameToShow.trim(),
        };
        if (entry.player.nafNumber !== undefined) {
          coach.nafNumber = entry.player.nafNumber;
        }
        return coach;
      }),
    );
  }
}
