import { z } from 'zod';

const stateShape = {
  lineUpMasterId: z.number().int(),
  level: z.number().int().nonnegative(),
  skillMasterIds: z.array(z.number().int()),
  totalSpp: z.number().int(),
  unspentSpp: z.number().int(),
};

const variantSchema = z.object({
  ...stateShape,
  sources: z.array(z.string().min(1)).min(1),
});

/**
 * One era directory's copies of one roster: the copies the TP import sends
 * (`chosen`; several on a tie, none when a copy could not be read), the
 * players all of them list (`listed`) and every other player any of its
 * copies lists (`listedElsewhere`): those only unsent copies list, and on a
 * tie those some but not all of the tied copies list. Player ids are in
 * numeric order.
 */
export const rosterCopyGroupSchema = z.object({
  era: z.string().min(1),
  rosterId: z.string().min(1),
  chosen: z.array(z.string().min(1)),
  listed: z.array(z.string()),
  listedElsewhere: z.array(z.string()),
});

/**
 * `snapshots.json`, saved by read-tp-roster-snapshots: every TP player id
 * the downloaded match and roster files show, with each distinct state they
 * show of him and the files showing it.
 */
export const tpRosterSnapshotsSchema = z.object({
  players: z.record(z.string().regex(/^\d+$/u), z.array(variantSchema).min(1)),
  /** The players shown in more than one state, ascending. */
  conflicts: z.array(z.string()),
  /** Source files that could not be read as snapshots. */
  unreadable: z.array(z.object({ source: z.string(), reason: z.string() })),
  /** Per era directory and roster id, the copies the TP import sends. */
  rosterCopies: z.array(rosterCopyGroupSchema),
});

/**
 * One state a file shows of a player: his TP position id, his level (his
 * paid advancements), every skill listed (starting skills included,
 * ascending, a repeated id kept), his total SPP and his unspent SPP.
 */
export type TpRosterSnapshotState = z.infer<z.ZodObject<typeof stateShape>>;
export type TpRosterSnapshotVariant = z.infer<typeof variantSchema>;
export type TpRosterSnapshots = z.infer<typeof tpRosterSnapshotsSchema>;
export type TpRosterCopyGroup = z.infer<typeof rosterCopyGroupSchema>;

/** What the player index builds: the file without its roster copies. */
export type TpRosterPlayerSnapshots = Omit<TpRosterSnapshots, 'rosterCopies'>;
