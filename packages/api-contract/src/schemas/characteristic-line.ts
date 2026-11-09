import { z } from 'zod';

/**
 * One complete MA/ST/AG/PA/AV characteristic line, whoever it belongs to: a
 * player's own current values, or a position's values under one rules set.
 *
 * `passing` is required but nullable, not optional: `null` asserts that the
 * rules set has no Passing characteristic at all. `TpOfficialCharacteristicsSchema`
 * is the variant for lines TP publishes, where `passing` is never null
 * because TP writes a literal 0 instead.
 */
export const CharacteristicLineSchema = z.object({
  move: z.number().int(),
  strength: z.number().int(),
  agility: z.number().int(),
  passing: z.number().int().nullable(),
  armour: z.number().int(),
});

/**
 * The five characteristic keys, in stat-line order. Exported so consumers
 * iterate the group rather than restating (and drifting from) the list.
 */
export const PLAYER_CHARACTERISTIC_KEYS = [
  'move',
  'strength',
  'agility',
  'passing',
  'armour',
] as const satisfies readonly (keyof CharacteristicLine)[];

export type CharacteristicLine = z.infer<typeof CharacteristicLineSchema>;
