import { z } from 'zod';

/**
 * One implementation-plan task as `develop-feature`'s Phase 4 records it: the
 * plan section (and optional subsection) the task sat under, and the commit
 * its work landed in. The order of the array is the order the tasks were
 * implemented in, which is the only ordering the split algorithm uses.
 */
const taskCheckpointSchema = z.object({
  taskNumber: z.number().int().positive(),
  /** `[section]`, or `[section, subsection]` — the plan nests no deeper. */
  sectionPath: z.array(z.string().min(1)).min(1).max(2),
  /** An abbreviated or full commit sha. */
  commitSha: z.string().regex(/^[0-9a-f]{7,40}$/),
});

export const taskCheckpointsSchema = z.array(taskCheckpointSchema).min(1);

export type TaskCheckpoint = z.infer<typeof taskCheckpointSchema>;
