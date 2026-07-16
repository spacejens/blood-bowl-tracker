/**
 * Every user-facing error/status message the Discord bot can send lives here as
 * a named constant, and each constant is referenced from exactly one call site
 * in production code. A message a user reports seeing can therefore be searched
 * for verbatim to find the exact code path that produced it. Text is
 * deliberately lighthearted and in-universe (Blood Bowl flavor), never a
 * technical description of the underlying failure.
 */

// --- Eras list (insights/facts/eras-list.ts) ---
export const ERAS_LIST_TIMEOUT_MESSAGE =
  'The historian is still leafing through the record books.';
export const ERAS_RULES_SET_TIMEOUT_MESSAGE =
  'The rules committee is still arguing over which edition applies.';
export const ERAS_LIST_NO_DATA_MESSAGE = 'The commentators are clearly drunk.';

// --- Stats summary (insights/facts/stats-summary.ts) ---
export const STATS_SUMMARY_ALL_TIME_TIMEOUT_MESSAGE =
  'The statistician fainted before finishing the tally.';
export const STATS_SUMMARY_ERA_TIMEOUT_MESSAGE =
  'The librarian got lost somewhere in the archives.';
export const STATS_SUMMARY_COMPETITION_NOT_FOUND_MESSAGE =
  "The league secretary can't find that competition anywhere in the standings.";
export const STATS_SUMMARY_COMPETITION_TIMEOUT_MESSAGE =
  'The scorekeeper dropped the clipboard mid-count.';

// --- Toplists (insights/facts/{player,team,coach,race}-toplist.ts) ---
export const PLAYER_TOPLIST_TIMEOUT_MESSAGE =
  'The players are still trudging back from the locker room.';
export const PLAYER_TOPLIST_NO_DATA_MESSAGE =
  'No player has stepped onto the pitch yet.';
export const TEAM_TOPLIST_TIMEOUT_MESSAGE =
  'The teams are stuck in the tunnel and running late.';
export const TEAM_TOPLIST_NO_DATA_MESSAGE = 'No team has taken the field yet.';
export const COACH_TOPLIST_TIMEOUT_MESSAGE =
  'The coaches are still bickering on the sideline.';
export const COACH_TOPLIST_NO_DATA_MESSAGE = 'No coach has clocked in yet.';
export const RACE_TOPLIST_TIMEOUT_MESSAGE =
  'The team buses are stuck in traffic outside the stadium.';
export const RACE_TOPLIST_NO_DATA_MESSAGE = 'No race has fielded a team yet.';

// --- /insights command (slash-commands/insights-command.service.ts) ---
export const INSIGHTS_UNMATCHED_CATEGORY_MESSAGE =
  "Even the Apothecary can't make sense of that one.";
export const INSIGHTS_ERA_NOT_FOUND_MESSAGE =
  "The Assistant Coach can't find that era in the history books.";
export const INSIGHTS_CATEGORY_UNSUPPORTED_FOR_ERA_MESSAGE =
  'That insight refuses to be pinned to a single era.';
export const INSIGHTS_ERA_COMPETITION_CONFLICT_MESSAGE =
  'The referee rejects your request.';
export const INSIGHTS_COMPETITION_NOT_FOUND_MESSAGE =
  "Even the league secretary can't find that competition in the fixture list.";
export const INSIGHTS_CATEGORY_UNSUPPORTED_FOR_COMPETITION_MESSAGE =
  "Even the Ref's assistant can't scope that to a competition.";
