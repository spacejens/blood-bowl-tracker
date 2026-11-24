import {
  PLAYER_CHARACTERISTICS,
  PLAYER_SKILL_SOURCES,
  SKILL_ACCESS_LEVELS,
} from '@blood-bowl-tracker/domain-enums';
import { z } from 'zod';

const gainSchema = z.union([
  z.object({ skill: z.string().min(1) }),
  z.object({
    characteristic: z.enum(PLAYER_CHARACTERISTICS),
    delta: z.number().int(),
  }),
]);

/**
 * One report of `reports.json`. The index writes only reports whose
 * advancement was understood, so what it gave and cost is always there.
 */
const tpFeedHistoryReportSchema = z.object({
  messageId: z.string().regex(/^\d+$/u),
  link: z.string(),
  timestamp: z.string(),
  teamName: z.string(),
  playerNumber: z.string(),
  playerName: z.string(),
  position: z.string(),
  botReacted: z.boolean(),
  rosterLink: z.string(),
  selection: z.enum(PLAYER_SKILL_SOURCES).extract(['random', 'chosen']),
  category: z.enum([...SKILL_ACCESS_LEVELS, 'characteristics']),
  gain: gainSchema,
  sppCost: z.number().int().nonnegative(),
  valueText: z.string(),
  rawValue: z.string(),
});

/** `reports.json`: team name -> player key -> reports, oldest first. */
export const tpFeedHistoryReportsSchema = z.record(
  z.string(),
  z.record(z.string(), z.array(tpFeedHistoryReportSchema)),
);
