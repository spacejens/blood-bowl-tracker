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
