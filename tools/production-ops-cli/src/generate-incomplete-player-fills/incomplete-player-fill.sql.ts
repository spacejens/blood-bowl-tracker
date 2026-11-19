import {
  BIG_GUY_KEYWORD_NAME,
  CONSEQUENCE_TYPES,
} from '@blood-bowl-tracker/domain-enums';

/**
 * The SQL the fill generator runs against production. Every statement is a
 * single SELECT with no trailing semicolon, since ProductionJsonQueryService
 * wraps it in json_agg. Column aliases are the row types' field names.
 */

/**
 * `INCOMPLETE_PLAYER_CRITERIA` (packages/game-data) as SQL over
 * `game_data.players`. incomplete-player-conditions.spec.ts renders the
 * drizzle criteria and requires this list to match them, so the generator
 * selects exactly the players `/debugincompleteimport` counts.
 */
export const INCOMPLETE_PLAYER_CONDITIONS = [
  'move = 0',
  'strength = 0',
  'agility = 0',
  'armour = 0',
  'spp_total is null',
  'spp_adjustment is null',
  'status is null',
] as const;

/**
 * Competitions still being played. A player of a team enrolled in one, or
 * playing in its matches, may still be active and gaining SPP, so he is not
 * filled.
 */
export const ONGOING_COMPETITION_NAMES = [
  'Major Season 31',
  'Ogretoberfest 14',
] as const;

/** INCOMPLETE_PLAYER_CONDITIONS as one SQL predicate over `game_data.players p`. */
const INCOMPLETE_PLAYER_PREDICATE = INCOMPLETE_PLAYER_CONDITIONS.map(
  (condition) => `p.${condition}`,
).join(' OR ');

const CANDIDATES_CTE = `WITH candidates AS (
  SELECT DISTINCT ON (p.id)
    p.id AS player_id, pe.external_id AS tp_id, te.team_id, p.team_era_id,
    p.position_id,
    te.era_id, p.spp_total, p.unspent_spp, p.status::text AS status,
    p.is_journeyman, p.move, p.strength, p.agility, p.passing, p.armour
  FROM game_data.players p
  JOIN game_data.team_eras te ON te.id = p.team_era_id
  JOIN game_data.positions pos ON pos.id = p.position_id
  JOIN game_data.players_external_ids pe ON pe.player_id = p.id
  JOIN game_data.external_systems es ON es.id = pe.external_system_id
  WHERE es.name = 'tourplay.net'
    AND pos.is_star_player = false
    AND (${INCOMPLETE_PLAYER_PREDICATE})
  ORDER BY p.id, pe.external_id
)`;

export const CANDIDATES_SQL = `${CANDIDATES_CTE}
SELECT player_id AS "playerId", tp_id AS "tpId", team_id AS "teamId",
  position_id AS "positionId", era_id AS "eraId", spp_total AS "sppTotal",
  unspent_spp AS "unspentSpp", status, is_journeyman AS "isJourneyman",
  move, strength, agility, passing, armour
FROM candidates`;

/**
 * The candidates, and every non-star TP player of a candidate's team,
 * complete or not: the players the TP feed can report. A player with a BBL
 * id as well counts as TP; one with no `tourplay.net` id is left out.
 * `is_incomplete` applies the conditions that select the candidates.
 */
export const TEAM_PLAYERS_CTE = `${CANDIDATES_CTE},
team_players AS (
  SELECT DISTINCT ON (p.id)
    p.id AS player_id, te.team_id, te.era_id, p.position_id,
    p.name AS player_name, pos.name AS position_name, p.spp_total,
    p.unspent_spp, p.is_journeyman,
    (${INCOMPLETE_PLAYER_PREDICATE}) AS is_incomplete
  FROM game_data.players p
  JOIN game_data.team_eras te ON te.id = p.team_era_id
  JOIN game_data.positions pos ON pos.id = p.position_id
  JOIN game_data.players_external_ids pe ON pe.player_id = p.id
  JOIN game_data.external_systems es ON es.id = pe.external_system_id
  WHERE es.name = 'tourplay.net'
    AND pos.is_star_player = false
    AND te.team_id IN (SELECT team_id FROM candidates)
  ORDER BY p.id
)`;

const STAT_REDUCTION_PREFIX = 'stat_reduction_';

const STAT_REDUCTION_TYPES = CONSEQUENCE_TYPES.filter((type) =>
  type.startsWith(STAT_REDUCTION_PREFIX),
)
  .map((type) => `'${type}'`)
  .join(', ');

/** Per candidate, whether match events record a stat reduction or a death for him. */
export const CONSEQUENCES_SQL = `${CANDIDATES_CTE}
SELECT me.consequence_player_id AS "playerId",
  bool_or(me.consequence_type IN (${STAT_REDUCTION_TYPES})) AS "hasStatReduction",
  bool_or(me.consequence_type = 'death') AS "hasDeath"
FROM game_data.match_events me
JOIN candidates c ON c.player_id = me.consequence_player_id
WHERE me.consequence_type IN (${STAT_REDUCTION_TYPES}, 'death')
GROUP BY me.consequence_player_id`;

export const STORED_ADVANCEMENTS_SQL = `${CANDIDATES_CTE}
SELECT pa.player_id AS "playerId", pa.source::text AS "source",
  pa.skill_id AS "skillId", s.name AS "skillName",
  pa.attribute_value AS "attributeValue", pa.is_free_extra AS "isFreeExtra"
FROM game_data.player_advancements pa
JOIN candidates c ON c.player_id = pa.player_id
LEFT JOIN game_data.skills s ON s.id = pa.skill_id
WHERE pa.removed = false`;

/**
 * Candidates holding an award of a trophy curated as granting a skill: the
 * award may have given him a skill outside his advancements, and a null
 * granted skill can mean it is not known yet. An award of any other trophy
 * gives no skill, so it is no risk.
 */
export const FREE_SKILL_RISK_SQL = `${CANDIDATES_CTE}
SELECT DISTINCT ta.player_id AS "playerId"
FROM game_data.trophy_awards ta
JOIN game_data.trophies t ON t.id = ta.trophy_id
JOIN candidates c ON c.player_id = ta.player_id
WHERE t.grants_skill = true`;

/**
 * Every team of an ongoing competition: enrolled in it, or a side in one of
 * its matches. A competition with neither has no row at all.
 */
export const ONGOING_COMPETITIONS_SQL = `SELECT DISTINCT
  c.name AS "competitionName", te.team_id AS "teamId"
FROM game_data.competitions c
JOIN (
  SELECT ct.competition_id, ct.team_era_id
  FROM game_data.competition_teams ct
  UNION
  SELECT m.competition_id, mt.team_era_id
  FROM game_data.matches m
  JOIN game_data.match_teams mt ON mt.match_id = m.id
) playing ON playing.competition_id = c.id
JOIN game_data.team_eras te ON te.id = playing.team_era_id
WHERE c.name IN (${ONGOING_COMPETITION_NAMES.map((name) => `'${name}'`).join(', ')})`;

export const POSITION_RULES_SETS_SQL = `${CANDIDATES_CTE}
SELECT prs.id AS "positionRulesSetId", prs.position_id AS "positionId",
  ers.era_id AS "eraId", prs.rules_set_id AS "rulesSetId",
  json_build_object('ma', prs.move, 'st', prs.strength, 'ag', prs.agility,
    'pa', prs.passing, 'av', prs.armour) AS "line",
  json_build_object('ma', rs.move_format, 'st', rs.strength_format,
    'ag', rs.agility_format, 'pa', rs.passing_format,
    'av', rs.armour_format) AS "formats"
FROM game_data.position_rules_sets prs
JOIN game_data.era_rules_sets ers ON ers.rules_set_id = prs.rules_set_id
JOIN game_data.rules_sets rs ON rs.id = prs.rules_set_id
WHERE (prs.position_id, ers.era_id) IN (
  SELECT position_id, era_id FROM candidates
)`;

export const POSITION_SKILLS_SQL = `${CANDIDATES_CTE}
SELECT DISTINCT ON (prss.id)
  prss.position_rules_set_id AS "positionRulesSetId",
  prss.skill_id AS "skillId", se.external_id AS "nameId",
  prss.attribute_value AS "attributeValue"
FROM game_data.position_rules_set_skills prss
JOIN game_data.position_rules_sets prs ON prs.id = prss.position_rules_set_id
JOIN game_data.era_rules_sets ers ON ers.rules_set_id = prs.rules_set_id
LEFT JOIN (
  game_data.skills_external_ids se
  JOIN game_data.external_systems ses
    ON ses.id = se.external_system_id AND ses.name = 'Name'
) ON se.skill_id = prss.skill_id
WHERE (prs.position_id, ers.era_id) IN (
  SELECT position_id, era_id FROM candidates
)
ORDER BY prss.id, se.external_id`;

/** Every rules set of a team player's era, with its cheapest advancement of any kind or league. */
export const ERA_RULES_SETS_SQL = `${TEAM_PLAYERS_CTE}
SELECT ers.era_id AS "eraId", ers.rules_set_id AS "rulesSetId",
  min(ac.spp_cost) AS "cheapestCost"
FROM game_data.era_rules_sets ers
LEFT JOIN game_data.advancement_costs ac ON ac.rules_set_id = ers.rules_set_id
WHERE ers.era_id IN (SELECT era_id FROM team_players)
GROUP BY ers.era_id, ers.rules_set_id`;

/** Every non-star TP player of a candidate's team, complete or not, to match feed reports against. */
export const TEAM_PLAYERS_SQL = `${TEAM_PLAYERS_CTE}
SELECT player_id AS "playerId", team_id AS "teamId", era_id AS "eraId",
  position_id AS "positionId", player_name AS "playerName",
  position_name AS "positionName", spp_total AS "sppTotal",
  unspent_spp AS "unspentSpp", is_journeyman AS "isJourneyman",
  is_incomplete AS "isIncomplete"
FROM team_players`;

/**
 * The stored paid advancements of every team player: gained skills with
 * their variant, and characteristic increases, neither removed nor free.
 */
export const PAID_ADVANCEMENTS_SQL = `${TEAM_PLAYERS_CTE}
SELECT pa.player_id AS "playerId", pa.skill_id AS "skillId",
  pa.attribute_value AS "attributeValue",
  lower(pa.characteristic::text) AS "characteristic"
FROM game_data.player_advancements pa
JOIN team_players tp ON tp.player_id = pa.player_id
WHERE pa.removed = false
  AND pa.source <> 'starting'
  AND pa.is_free_extra = false`;

/** The TP roster id (`tourplay.net` external id) of every candidate's team. */
export const TEAM_ROSTERS_SQL = `${CANDIDATES_CTE}
SELECT DISTINCT tei.team_id AS "teamId", tei.external_id AS "rosterId"
FROM game_data.teams_external_ids tei
JOIN game_data.external_systems es ON es.id = tei.external_system_id
WHERE es.name = 'tourplay.net'
  AND tei.team_id IN (SELECT team_id FROM candidates)`;

/** Every `Name`-system id of every skill, with the skill's stored name. */
export const SKILL_NAMES_SQL = `SELECT se.skill_id AS "skillId",
  s.name AS "skillName", se.external_id AS "nameId"
FROM game_data.skills_external_ids se
JOIN game_data.external_systems es ON es.id = se.external_system_id
JOIN game_data.skills s ON s.id = se.skill_id
WHERE es.name = 'Name'`;

const TEAM_PLAYER_RULES_SET_IDS = `SELECT ers.rules_set_id
  FROM game_data.era_rules_sets ers
  WHERE ers.era_id IN (SELECT era_id FROM team_players)`;

/** Every skill's category under every rules set of a team player's era. */
export const SKILL_CATEGORIES_SQL = `${TEAM_PLAYERS_CTE}
SELECT srs.skill_id AS "skillId", srs.rules_set_id AS "rulesSetId",
  srs.category::text AS "category"
FROM game_data.skill_rules_sets srs
WHERE srs.rules_set_id IN (${TEAM_PLAYER_RULES_SET_IDS})`;

/** Each team player position's access to skill categories under his era's rules sets. */
export const POSITION_ACCESS_SQL = `${TEAM_PLAYERS_CTE}
SELECT DISTINCT prs.position_id AS "positionId",
  prs.rules_set_id AS "rulesSetId",
  prsc.skill_category::text AS "category", prsc.access::text AS "access"
FROM game_data.position_rules_set_skill_categories prsc
JOIN game_data.position_rules_sets prs ON prs.id = prsc.position_rules_set_id
JOIN game_data.era_rules_sets ers ON ers.rules_set_id = prs.rules_set_id
WHERE prsc.removed = false
  AND (prs.position_id, ers.era_id) IN (
    SELECT position_id, era_id FROM team_players
  )`;

/**
 * The advancement costs that apply to a team player's era: each rules set's
 * own rows and the rows of the era's league, the rows UnspentSppService
 * (packages/game-data) prices a player's advancements with.
 */
export const ADVANCEMENT_COSTS_SQL = `${TEAM_PLAYERS_CTE}
SELECT ers.era_id AS "eraId", ac.rules_set_id AS "rulesSetId",
  ac.league_id AS "leagueId", ac.advancement_number AS "advancementNumber",
  ac.advancement_kind::text AS "advancementKind", ac.skill_id AS "skillId",
  ac.spp_cost AS "sppCost"
FROM game_data.era_rules_sets ers
JOIN game_data.eras e ON e.id = ers.era_id
JOIN game_data.advancement_costs ac ON ac.rules_set_id = ers.rules_set_id
  AND (ac.league_id IS NULL OR ac.league_id = e.league_id)
WHERE ers.era_id IN (SELECT DISTINCT era_id FROM team_players)`;

/** Every stat-reduction match event of a candidate, with the match's competition and date. */
export const STAT_REDUCTION_EVENTS_SQL = `${CANDIDATES_CTE}
SELECT me.consequence_player_id AS "playerId",
  replace(me.consequence_type::text, '${STAT_REDUCTION_PREFIX}', '')
    AS "characteristic",
  m.competition_id AS "competitionId", m.played_at AS "playedAt"
FROM game_data.match_events me
JOIN candidates c ON c.player_id = me.consequence_player_id
JOIN game_data.matches m ON m.id = me.match_id
WHERE me.consequence_type IN (${STAT_REDUCTION_TYPES})`;

/**
 * For each candidate with a stat reduction, every competition his team era
 * played a match in, with the last such match.
 */
export const TEAM_COMPETITIONS_SQL = `${CANDIDATES_CTE}
SELECT c.player_id AS "playerId", m.competition_id AS "competitionId",
  max(m.played_at) AS "lastPlayedAt"
FROM candidates c
JOIN game_data.match_teams mt ON mt.team_era_id = c.team_era_id
JOIN game_data.matches m ON m.id = mt.match_id
WHERE c.player_id IN (
  SELECT me.consequence_player_id FROM game_data.match_events me
  WHERE me.consequence_type IN (${STAT_REDUCTION_TYPES})
)
GROUP BY c.player_id, m.competition_id`;

/**
 * Each candidate position and era where the position carries the Big Guy
 * keyword under a rules set of the era: not a basic position, so a marked
 * journeyman in it is not filled.
 */
export const BIG_GUY_POSITIONS_SQL = `${CANDIDATES_CTE}
SELECT DISTINCT prs.position_id AS "positionId", ers.era_id AS "eraId"
FROM game_data.position_rules_set_keywords prk
JOIN game_data.keywords k ON k.id = prk.keyword_id
JOIN game_data.position_rules_sets prs ON prs.id = prk.position_rules_set_id
JOIN game_data.era_rules_sets ers ON ers.rules_set_id = prs.rules_set_id
WHERE k.name = '${BIG_GUY_KEYWORD_NAME}'
  AND (prs.position_id, ers.era_id) IN (
    SELECT position_id, era_id FROM candidates
  )`;

/** The five lasting stat-reduction columns of `game_data.players`. */
export const REDUCTION_COUNT_COLUMNS = [
  'move_reduction_count',
  'strength_reduction_count',
  'agility_reduction_count',
  'passing_reduction_count',
  'armour_reduction_count',
] as const;

const LINE_COLUMNS = (alias: string): string =>
  `'ma', ${alias}.move, 'st', ${alias}.strength, 'ag', ${alias}.agility,
      'pa', ${alias}.passing, 'av', ${alias}.armour`;

/**
 * The `lastingInjuryRepairs` candidates: every non-star TP player no longer
 * incomplete, with a stat-reduction match event recorded and no lasting
 * reduction stored, named by one TP id (the first in text order), with what
 * the server derives his reductions from: his stored line, his active
 * characteristic increases, and the rules set context
 * PositionRulesSetsService.findCharacteristicsContext resolves for his
 * position and his team era's era (the last-listed era rules set with a
 * row for the position, else the last-listed one with no start line; null
 * when the era lists none). LastingInjuryRepairSelectorService keeps those
 * the server would record a reduction for. INCOMPLETE_PLAYER_CONDITIONS
 * never yields NULL (the characteristic columns are NOT NULL and the rest
 * are `is null` tests), so NOT (...) selects exactly the complete players.
 * The rules-set context subquery must track
 * PositionRulesSetsService.findCharacteristicsContext in packages/game-data.
 */
export const LASTING_INJURY_REPAIRS_SQL = `SELECT DISTINCT ON (p.id)
  json_build_object('system', 'tourplay.net', 'id', pe.external_id)
    AS "player",
  json_build_object(${LINE_COLUMNS('p')}) AS "line",
  coalesce((
    SELECT json_agg(lower(adv.characteristic::text) ORDER BY adv.id)
    FROM game_data.player_advancements adv
    WHERE adv.player_id = p.id
      AND adv.removed = false
      AND adv.source = 'characteristic'
      AND adv.characteristic IS NOT NULL
  ), '[]'::json) AS "increases",
  (
    SELECT json_build_object(
      'formats', json_build_object('ma', rs.move_format,
        'st', rs.strength_format, 'ag', rs.agility_format,
        'pa', rs.passing_format, 'av', rs.armour_format),
      'baseline', CASE WHEN prs.id IS NULL THEN NULL
        ELSE json_build_object(${LINE_COLUMNS('prs')}) END)
    FROM game_data.era_rules_sets ers
    JOIN game_data.rules_sets rs ON rs.id = ers.rules_set_id
    LEFT JOIN game_data.position_rules_sets prs
      ON prs.rules_set_id = ers.rules_set_id
      AND prs.position_id = p.position_id
    WHERE ers.era_id = te.era_id
    ORDER BY (prs.id IS NULL) ASC, ers.id DESC
    LIMIT 1
  ) AS "context"
FROM game_data.players p
JOIN game_data.team_eras te ON te.id = p.team_era_id
JOIN game_data.positions pos ON pos.id = p.position_id
JOIN game_data.players_external_ids pe ON pe.player_id = p.id
JOIN game_data.external_systems es ON es.id = pe.external_system_id
WHERE es.name = 'tourplay.net'
  AND pos.is_star_player = false
  AND NOT (${INCOMPLETE_PLAYER_PREDICATE})
  AND ${REDUCTION_COUNT_COLUMNS.map((column) => `p.${column} = 0`).join('\n  AND ')}
  AND EXISTS (
    SELECT 1 FROM game_data.match_events me
    WHERE me.consequence_player_id = p.id
      AND me.consequence_type IN (${STAT_REDUCTION_TYPES})
  )
ORDER BY p.id, pe.external_id`;
