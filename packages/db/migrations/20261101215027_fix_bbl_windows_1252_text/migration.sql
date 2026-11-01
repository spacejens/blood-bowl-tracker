-- BBL's pages declare ISO-8859-1 but are Windows-1252, and decoding them as
-- ISO-8859-1 stored bytes 0x80-0x9F (curly quotes, dashes, the ellipsis and
-- similar) as invisible C1 control characters (U+0080-U+009F). This rewrites
-- every importer-sourced name holding one: each control character becomes
-- its Windows-1252 character, and curly single and double quotes fold to '
-- and ", the folding tools/import-bbl's NormalizeExtractedTextService applies
-- on import. The five bytes Windows-1252 leaves undefined (0x81, 0x8D, 0x8F,
-- 0x90, 0x9D) stay as they are. A control character is never a curated
-- value, so curated names are untouched, and a second run finds nothing to
-- change. The history triggers record every change.
--
-- from_chars and to_chars line up position by position (35 characters each):
-- the 27 defined C1 controls in byte order, then U+2018-U+201B and
-- U+201C-U+201F. Their targets are the Windows-1252 characters, with the
-- single quotes (0x82, 0x91, 0x92 and U+2018-U+201B) folded to ' and the
-- double quotes (0x84, 0x93, 0x94 and U+201C-U+201F) folded to ".
DO $$
DECLARE
  from_chars CONSTANT text := E'\u0080\u0082\u0083\u0084\u0085\u0086\u0087\u0088\u0089\u008A\u008B\u008C\u008E\u0091\u0092\u0093\u0094\u0095\u0096\u0097\u0098\u0099\u009A\u009B\u009C\u009E\u009F‘’‚‛“”„‟';
  to_chars CONSTANT text := E'€\'ƒ"…†‡ˆ‰Š‹ŒŽ\'\'""•–—˜™š›œžŸ\'\'\'\'""""';
  c1 CONSTANT text := E'[\u0080-\u009F]';
  target text;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'coaches', 'competition_groups', 'competitions', 'eras', 'keywords',
    'leagues', 'matches', 'players', 'positions', 'races', 'rules_sets',
    'skills', 'teams', 'trophies'
  ] LOOP
    EXECUTE format(
      'UPDATE "game_data".%I SET "name" = translate("name", $1, $2) '
      || 'WHERE "name" ~ $3 AND translate("name", $1, $2) <> "name"',
      target
    ) USING from_chars, to_chars, c1;
  END LOOP;
END $$;
--> statement-breakpoint
-- Name external ids are matched by exact string, so once the importer
-- produces the corrected spelling it would no longer find a row registered
-- under the old one. Every Name external id holding a C1 control character
-- therefore gains its corrected spelling as an additional external id on the
-- same row, and the old one stays. The id itself is corrected, not rebuilt
-- from the row's name, because some Name ids are not the bare name (a
-- position's is "<race>: <position>"). The insert is skipped when any row
-- already holds the corrected spelling, and when two old spellings fold to
-- the same new one only the lower-id row gets it, so the unique
-- (external_system_id, external_id) key is never violated and no two rows
-- are merged. A plain INSERT, never ON CONFLICT: see "History tracking" in
-- docs/database.md. The character mapping is the same as in the statement
-- above.
DO $$
DECLARE
  from_chars CONSTANT text := E'\u0080\u0082\u0083\u0084\u0085\u0086\u0087\u0088\u0089\u008A\u008B\u008C\u008E\u0091\u0092\u0093\u0094\u0095\u0096\u0097\u0098\u0099\u009A\u009B\u009C\u009E\u009F‘’‚‛“”„‟';
  to_chars CONSTANT text := E'€\'ƒ"…†‡ˆ‰Š‹ŒŽ\'\'""•–—˜™š›œžŸ\'\'\'\'""""';
  c1 CONSTANT text := E'[\u0080-\u009F]';
  target record;
BEGIN
  FOR target IN
    SELECT * FROM (VALUES
      ('coaches_external_ids', 'coach_id'),
      ('competition_groups_external_ids', 'competition_group_id'),
      ('competitions_external_ids', 'competition_id'),
      ('eras_external_ids', 'era_id'),
      ('keywords_external_ids', 'keyword_id'),
      ('leagues_external_ids', 'league_id'),
      ('match_events_external_ids', 'match_event_id'),
      ('matches_external_ids', 'match_id'),
      ('players_external_ids', 'player_id'),
      ('positions_external_ids', 'position_id'),
      ('races_external_ids', 'race_id'),
      ('rules_sets_external_ids', 'rules_set_id'),
      ('skills_external_ids', 'skill_id'),
      ('teams_external_ids', 'team_id'),
      ('trophies_external_ids', 'trophy_id')
    ) AS t(table_name, owner_column)
  LOOP
    EXECUTE format(
      'INSERT INTO "game_data".%1$I (%2$I, "external_system_id", "external_id") '
      || 'SELECT DISTINCT ON (c.fixed) c.owner_id, c.external_system_id, c.fixed '
      || 'FROM ('
      || 'SELECT e.%2$I AS owner_id, e."external_system_id", e."external_id", '
      || 'e."id", translate(e."external_id", $1, $2) AS fixed '
      || 'FROM "game_data".%1$I AS e '
      || 'JOIN "game_data"."external_systems" AS s '
      || 'ON s."id" = e."external_system_id" '
      || 'WHERE s."name" = ''Name'' AND e."external_id" ~ $3'
      || ') AS c '
      || 'WHERE c.fixed <> c.external_id '
      || 'AND NOT EXISTS ('
      || 'SELECT 1 FROM "game_data".%1$I AS x '
      || 'WHERE x."external_system_id" = c.external_system_id '
      || 'AND x."external_id" = c.fixed'
      || ') '
      || 'ORDER BY c.fixed, c.id',
      target.table_name,
      target.owner_column
    ) USING from_chars, to_chars, c1;
  END LOOP;
END $$;
