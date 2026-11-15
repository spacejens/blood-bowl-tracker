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

const CANDIDATES_CTE = `WITH candidates AS (
  SELECT DISTINCT ON (p.id)
    p.id AS player_id, pe.external_id AS tp_id, te.team_id, p.position_id,
    te.era_id, p.spp_total, p.unspent_spp, p.status::text AS status,
    p.is_journeyman, p.move, p.strength, p.agility, p.passing, p.armour
  FROM game_data.players p
  JOIN game_data.team_eras te ON te.id = p.team_era_id
  JOIN game_data.positions pos ON pos.id = p.position_id
  JOIN game_data.players_external_ids pe ON pe.player_id = p.id
  JOIN game_data.external_systems es ON es.id = pe.external_system_id
  WHERE es.name = 'tourplay.net'
    AND pos.is_star_player = false
    AND (${INCOMPLETE_PLAYER_CONDITIONS.map((condition) => `p.${condition}`).join(' OR ')})
  ORDER BY p.id, pe.external_id
)`;

export const CANDIDATES_SQL = `${CANDIDATES_CTE}
SELECT player_id AS "playerId", tp_id AS "tpId", team_id AS "teamId",
  position_id AS "positionId", era_id AS "eraId", spp_total AS "sppTotal",
  unspent_spp AS "unspentSpp", status, is_journeyman AS "isJourneyman",
  move, strength, agility, passing, armour
FROM candidates`;

const STAT_REDUCTION_TYPES = `'stat_reduction_ma', 'stat_reduction_st',
  'stat_reduction_ag', 'stat_reduction_pa', 'stat_reduction_av'`;

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
 * Candidates holding any trophy award: a trophy may grant a skill, and a
 * null granted skill can mean it is not known yet.
 */
export const FREE_SKILL_RISK_SQL = `${CANDIDATES_CTE}
SELECT DISTINCT ta.player_id AS "playerId"
FROM game_data.trophy_awards ta
JOIN candidates c ON c.player_id = ta.player_id`;

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

/** Every rules set of a candidate's era, with its cheapest advancement of any kind or league. */
export const ERA_RULES_SETS_SQL = `${CANDIDATES_CTE}
SELECT ers.era_id AS "eraId", ers.rules_set_id AS "rulesSetId",
  min(ac.spp_cost) AS "cheapestCost"
FROM game_data.era_rules_sets ers
LEFT JOIN game_data.advancement_costs ac ON ac.rules_set_id = ers.rules_set_id
WHERE ers.era_id IN (SELECT era_id FROM candidates)
GROUP BY ers.era_id, ers.rules_set_id`;
