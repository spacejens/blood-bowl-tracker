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
export const ERAS_LIST_NO_DATA_MESSAGE = 'The commentators are clearly drunk.';

// --- Trophies list (insights/facts/trophies-list.service.ts) ---
export const TROPHIES_LIST_TIMEOUT_MESSAGE =
  'The curator is still cataloguing every cup in the cabinet.';
export const TROPHIES_LIST_NO_DATA_MESSAGE = 'The trophy cabinet is bare.';

// --- Competition groups list (insights/facts/competition-groups-list.service.ts) ---
export const COMPETITION_GROUPS_LIST_TIMEOUT_MESSAGE =
  'The fixture secretary is still leafing through every calendar in the cabinet.';
export const COMPETITION_GROUPS_LIST_NO_DATA_MESSAGE =
  'Not a single recurring fixture has been pencilled in yet.';

// --- Stats summary (insights/facts/stats-summary.ts) ---
export const STATS_SUMMARY_ALL_TIME_TIMEOUT_MESSAGE =
  'The statistician fainted before finishing the tally.';
export const STATS_SUMMARY_ERA_TIMEOUT_MESSAGE =
  'The librarian got lost somewhere in the archives.';
export const STATS_SUMMARY_COMPETITION_NOT_FOUND_MESSAGE =
  "The league secretary can't find that competition anywhere in the standings.";
export const STATS_SUMMARY_COMPETITION_TIMEOUT_MESSAGE =
  'The scorekeeper dropped the clipboard mid-count.';
export const STATS_SUMMARY_LEAGUE_TIMEOUT_MESSAGE =
  'The commissioner is still auditing the whole league.';

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
export const COACH_TOPLIST_NO_DATA_MESSAGE =
  'The referee has ejected the coaches from the stadium.';
export const RACE_TOPLIST_TIMEOUT_MESSAGE =
  'The team wagons are stuck in traffic outside the stadium.';
export const RACE_TOPLIST_NO_DATA_MESSAGE = 'The NAF has collapsed.';

// --- /insights command (slash-commands/insights-command.service.ts) ---
export const INSIGHTS_UNMATCHED_CATEGORY_MESSAGE =
  "Even the apothecary can't put that one together.";
export const INSIGHTS_ERA_NOT_FOUND_MESSAGE =
  "The assistant coach can't find that era in the history books.";
export const INSIGHTS_CATEGORY_UNSUPPORTED_FOR_ERA_MESSAGE =
  'The food stands are all out of sausages.';
export const INSIGHTS_SCOPE_CONFLICT_MESSAGE =
  'The referee rejects your request.';
export const INSIGHTS_COMPETITION_NOT_FOUND_MESSAGE =
  "Even the league secretary can't find that competition in the fixture list.";
export const INSIGHTS_CATEGORY_UNSUPPORTED_FOR_COMPETITION_MESSAGE =
  "Even the referee's assistant won't accept your bribes.";
export const INSIGHTS_LEAGUE_NOT_FOUND_MESSAGE =
  'The commissioner has no record of that league in the standings.';
export const INSIGHTS_CATEGORY_UNSUPPORTED_FOR_LEAGUE_MESSAGE =
  'The stadium turnstiles are jammed shut.';
export const INSIGHTS_CATEGORY_UNSUPPORTED_FOR_MATCH_CATEGORY_MESSAGE =
  'The scoreboard scribe has misfiled that stack of match reports.';

// --- /deepdive command (slash-commands/deepdive-command.service.ts,
//     deepdive/facts/era-deepdive.ts) ---
export const DEEPDIVE_USAGE_MESSAGE =
  'Tell the loremaster what to dig into (try one of the options).';
export const DEEPDIVE_ERA_NOT_FOUND_MESSAGE =
  'The team wizard has turned themselves into a frog.';
export const DEEPDIVE_ERA_TIMEOUT_MESSAGE =
  'The dwarfs are still reading the Book of Grudges.';
export const DEEPDIVE_RULES_SET_TIMEOUT_MESSAGE =
  'The rules lawyers are still cross-referencing which editions applied.';
export const DEEPDIVE_COMPETITIONS_TIMEOUT_MESSAGE =
  'The tournament clerk is still sorting through the old fixture lists.';
export const DEEPDIVE_EXTERNAL_SYSTEMS_TIMEOUT_MESSAGE =
  'The record-keepers are still arguing over which ledgers count.';
export const DEEPDIVE_NO_COMPETITIONS_MESSAGE =
  'Not a single whistle has blown in this era yet.';
export const DEEPDIVE_COACH_NOT_FOUND_MESSAGE =
  'No such coach has ever signed a contract in these parts.';
export const DEEPDIVE_COACH_TIMEOUT_MESSAGE =
  'The coach is still lost somewhere in the locker-room corridors.';
export const DEEPDIVE_COACH_NO_MATCHES_MESSAGE =
  'This coach has yet to send a single team onto the pitch.';
export const DEEPDIVE_COACH_ERAS_TIMEOUT_MESSAGE =
  'The league registrar is still digging out which eras this coach signed up for.';
export const DEEPDIVE_COACH_CAREER_TIMEOUT_MESSAGE =
  "The archivist is still leafing through this coach's match ledger.";
export const DEEPDIVE_COACH_TEAMS_TIMEOUT_MESSAGE =
  "The equipment manager is still counting up this coach's roster of teams.";
export const DEEPDIVE_COACH_TEAM_CONTEXT_TIMEOUT_MESSAGE =
  'The scribe is still tracking down which races those teams belong to.';
export const DEEPDIVE_MULTIPLE_TARGETS_MESSAGE =
  'The referees are arguing amongst themselves about which one you meant — pick a single target.';
export const DEEPDIVE_TEAM_NOT_FOUND_MESSAGE =
  'No such team has ever laced up a pair of boots around here.';
export const DEEPDIVE_TEAM_TIMEOUT_MESSAGE =
  'The team wagon is stuck at the stadium gates.';
export const DEEPDIVE_TEAM_NO_MATCHES_MESSAGE =
  'This team has yet to set a single cleat on the pitch.';
export const DEEPDIVE_TEAM_CAREER_TIMEOUT_MESSAGE =
  'The team historian is still thumbing through the match-day programmes.';
export const DEEPDIVE_TEAM_PLAYERS_TIMEOUT_MESSAGE =
  'The roster manager is still tallying up who did what on the pitch.';
export const DEEPDIVE_TEAM_PLAYER_CONTEXT_TIMEOUT_MESSAGE =
  'The team scout is still checking which positions those players line up in.';
export const DEEPDIVE_TEAM_ERAS_TIMEOUT_MESSAGE =
  'The league registrar is still digging out which eras this team signed up for.';
export const DEEPDIVE_TEAM_HONORS_TIMEOUT_MESSAGE =
  'The trophy cabinet is still being unlocked to see what this lot have won.';
export const DEEPDIVE_PLAYER_NOT_FOUND_MESSAGE =
  'No such player has ever pulled on a jersey in this league.';
export const DEEPDIVE_PLAYER_TIMEOUT_MESSAGE =
  'The player is still stuck in the shower block after the match.';
export const DEEPDIVE_PLAYER_COUNTS_TIMEOUT_MESSAGE =
  'The stat-keeper is still tallying up everything this player got up to.';
export const DEEPDIVE_PLAYER_NO_EVENTS_MESSAGE =
  "This player hasn't done anything worth writing home about yet.";
export const DEEPDIVE_PLAYER_HONORS_TIMEOUT_MESSAGE =
  "The groundskeeper is still polishing this one's share of the trophy cabinet.";
export const DEEPDIVE_PLAYER_DEATH_TIMEOUT_MESSAGE =
  'The apothecary is still filling in the paperwork on how this one went down.';
export const DEEPDIVE_PLAYER_KILLS_TIMEOUT_MESSAGE =
  'The undertaker is still counting the bodies this one left behind.';
export const DEEPDIVE_STAR_PLAYER_NOT_FOUND_MESSAGE =
  'No star of that name has ever taken an inducement fee around here.';
export const DEEPDIVE_STAR_PLAYER_TIMEOUT_MESSAGE =
  "The star's agent is still haggling over the appearance fee.";
export const DEEPDIVE_STAR_PLAYER_HIRES_TIMEOUT_MESSAGE =
  'The bookkeeper is still adding up every contract this one has signed.';
export const DEEPDIVE_RACE_NOT_FOUND_MESSAGE =
  'No such race has ever fielded a team in these parts.';
export const DEEPDIVE_RACE_TIMEOUT_MESSAGE =
  "The loremaster is still tracing this race's bloodline.";
export const DEEPDIVE_RACE_ERAS_TIMEOUT_MESSAGE =
  'The archivist is still checking which eras this race turned up in.';
export const DEEPDIVE_RACE_TEAMS_TIMEOUT_MESSAGE =
  'The scout is still counting how many teams of this race took the field.';
export const DEEPDIVE_RACE_TEAM_CONTEXT_TIMEOUT_MESSAGE =
  'The scout is still tracking down which coaches those teams belong to.';
export const DEEPDIVE_RACE_NO_TEAMS_MESSAGE =
  'No team of this race has taken the field yet.';
export const DEEPDIVE_COMPETITION_NOT_FOUND_MESSAGE =
  'The league secretary has no such competition on the fixture list.';
export const DEEPDIVE_COMPETITION_TIMEOUT_MESSAGE =
  'The tournament clerk is still digging the trophy out of the cabinet.';
export const DEEPDIVE_COMPETITION_TEAMS_TIMEOUT_MESSAGE =
  'The turnstile operators are still tallying who turned up to play.';
export const DEEPDIVE_COMPETITION_TEAM_CONTEXT_TIMEOUT_MESSAGE =
  'The clerk is still tracking down which races and coaches turned up to this competition.';
export const DEEPDIVE_COMPETITION_NO_TEAMS_MESSAGE =
  'Not a single team has signed up for this competition yet.';
export const DEEPDIVE_COMPETITION_TROPHIES_TIMEOUT_MESSAGE =
  'The presentation party is still wheeling the silverware out onto the pitch.';
export const DEEPDIVE_COMPETITION_TROPHY_CONTEXT_TIMEOUT_MESSAGE =
  'The announcer is still checking who these winners actually play for.';
export const DEEPDIVE_COMPETITION_NO_TROPHIES_MESSAGE =
  'Nothing was handed out at this one — everyone went home empty-handed.';
export const DEEPDIVE_TROPHY_NOT_FOUND_MESSAGE =
  'No such trophy has ever been polished in this cabinet.';
export const DEEPDIVE_TROPHY_TIMEOUT_MESSAGE =
  'The curator is still fumbling with the keys to the trophy cabinet.';
export const DEEPDIVE_TROPHY_RECIPIENTS_TIMEOUT_MESSAGE =
  'The engraver is still working down the list of names on the plinth.';
export const DEEPDIVE_TROPHY_NO_RECIPIENTS_MESSAGE =
  'Nobody has got their hands on this one yet.';
export const DEEPDIVE_TROPHY_RECIPIENT_CONTEXT_TIMEOUT_MESSAGE =
  'The clerk is still tracking down which races, teams and coaches these recipients belong to.';
export const DEEPDIVE_COMPETITION_GROUP_NOT_FOUND_MESSAGE =
  'No such recurring fixture has ever been pencilled into the calendar.';
export const DEEPDIVE_COMPETITION_GROUP_TIMEOUT_MESSAGE =
  'The fixture secretary is still leafing back through the old calendars.';
export const DEEPDIVE_COMPETITION_GROUP_TROPHIES_TIMEOUT_MESSAGE =
  'The silversmith is still hunting down which cups belong on this shelf.';
export const DEEPDIVE_COMPETITION_GROUP_COMPETITIONS_TIMEOUT_MESSAGE =
  'The archivist is still stacking up every year this one has been run.';
export const DEEPDIVE_COMPETITION_GROUP_NO_TROPHIES_MESSAGE =
  'Not one piece of silverware rides on this one.';
export const DEEPDIVE_COMPETITION_GROUP_NO_COMPETITIONS_MESSAGE =
  'This fixture has never actually been played.';
