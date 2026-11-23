import { z } from 'zod';

const skillRefSchema = z.object({ skillMasterId: z.number().int() });

/** The fields of one TP line-up entry the snapshot collector reads. */
const lineUpSchema = z.object({
  id: z.number().int(),
  lineUpMasterId: z.number().int(),
  level: z.number().int().nonnegative(),
  skills: z.array(skillRefSchema),
  totalStarPlayerPoints: z.number().int(),
  starPlayerPoints: z.number().int(),
});

export type SnapshotLineUp = z.infer<typeof lineUpSchema>;
export type SnapshotSkillRef = z.infer<typeof skillRefSchema>;

const sideSchema = z.object({
  roster: z.object({ lineUps: z.array(lineUpSchema) }),
});

/** A `match_<id>.json`: each side's line-ups as the match embeds them. */
export const matchSnapshotFileSchema = z.object({
  inscriptionLocal: sideSchema,
  inscriptionVisitor: sideSchema,
});

/**
 * A `rosters_<id>.json`: its line-ups, whose own skills are the gained ones;
 * the position template's skills are the starting ones.
 */
export const rosterSnapshotFileSchema = z.object({
  lineUps: z.array(
    lineUpSchema.extend({
      lineUpMaster: z.object({ skills: z.array(skillRefSchema) }).nullish(),
    }),
  ),
});

/**
 * The fields of a `rosters_<id>.json` that tell which copy the TP import
 * sends: the roster id, the players listed and when its newest match
 * finished. `lastMatches` is read as leniently as packages/parse-tp's
 * RosterSchema reads it, so a malformed one never makes a copy unreadable;
 * tp-roster-copy-reader.drift.spec.ts requires the two to agree.
 */
export const rosterCopyFileSchema = z.object({
  id: z.number().int(),
  lineUps: z.array(z.object({ id: z.number().int() })),
  lastMatches: z
    .array(
      z.object({
        scores: z
          .array(z.object({ finishInstant: z.string().nullish().catch(null) }))
          .catch([]),
      }),
    )
    .catch([])
    .optional(),
});
