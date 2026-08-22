import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import JSON5 from 'json5';
import { describe, expect, it } from 'vitest';

import type { ManualDataFile } from './manual-data-file.schema';
import { ManualDataFileSchema } from './manual-data-file.schema';

const DATA_ROOT = join(__dirname, '../../data');

/**
 * Parses and validates every curated JSON5 file in one phase directory,
 * pooling the sections exactly as ManualDataReader does at runtime. These
 * tests guard the real curated data -- nothing else in the suite reads it --
 * so a typo in a group name or an invalid entry shape fails here rather than
 * halfway through a live import run.
 */
function readPhase(phase: string): ManualDataFile {
  const dir = join(DATA_ROOT, phase);
  const files = readdirSync(dir).filter((name) => name.endsWith('.json5'));
  const pooled = ManualDataFileSchema.parse({});
  for (const name of files) {
    const parsed = ManualDataFileSchema.parse(
      JSON5.parse(readFileSync(join(dir, name), 'utf8')),
    );
    for (const key of Object.keys(pooled) as (keyof ManualDataFile)[]) {
      (pooled[key] as unknown[]).push(...(parsed[key] as unknown[]));
    }
  }
  return pooled;
}

/**
 * Parses and validates a single curated JSON5 file in isolation, without
 * pooling it against its sibling files in the same phase directory. Use this
 * instead of `readPhase` when a test must assert something about exactly one
 * file's own declarations -- `readPhase` pools `externalSystems` (and every
 * other section) across every file in the directory, so an assertion against
 * `readPhase(...).externalSystems` can pass even when the file under test
 * declares nothing at all, as long as some sibling file does.
 */
function readFile(phase: string, name: string): ManualDataFile {
  return ManualDataFileSchema.parse(
    JSON5.parse(readFileSync(join(DATA_ROOT, phase, name), 'utf8')),
  );
}

describe('curated data files', () => {
  it('parses every before-other-importers file', () => {
    expect(() => readPhase('before-other-importers')).not.toThrow();
  });

  it('parses every after-other-importers file', () => {
    expect(() => readPhase('after-other-importers')).not.toThrow();
  });

  it('curates both real leagues with BBL-compatible external ids', () => {
    const leagues = readPhase('before-other-importers').leagues;
    expect(leagues.map((league) => league.name).sort()).toEqual([
      'GBBL',
      'tLoEG',
    ]);
    for (const league of leagues) {
      expect(league.externalIds).toContainEqual({
        system: 'tloeg.bbleague.se',
        id: league.name,
      });
    }
  });

  it('curates all 14 competition groups against a real league', () => {
    const data = readPhase('before-other-importers');
    const leagueIds = new Set(
      data.leagues.flatMap((league) =>
        league.externalIds.map((ref) => `${ref.system}|${ref.id}`),
      ),
    );

    expect(data.competitionGroups).toHaveLength(14);
    expect(data.competitionGroups.map((group) => group.name)).toEqual([
      'Major Season',
      'Minor Season',
      'Chaos Cup',
      'Stunty Leeg',
      'Fright Night',
      'Snöbollskrieg',
      'Moot Mania',
      'Champion of tLoEG',
      'NAA',
      'Blitzmania!',
      'Ogretoberfest',
      'Dungeon Bowl',
      'Reserves Rumble',
      'GBBL',
    ]);
    for (const group of data.competitionGroups) {
      expect(leagueIds).toContain(`${group.league.system}|${group.league.id}`);
    }
  });

  it('keeps the after-other-importers phase to rename-only competition entries', () => {
    // Classification is curated in
    // data/before-other-importers/competitions.json5: a competition's group
    // must be correct before the BBL/TP importers run. What is left here can
    // only run afterwards -- renaming a row the importers created.
    const competitions = readPhase('after-other-importers').competitions;

    expect(competitions).toHaveLength(36);
    for (const competition of competitions) {
      expect(competition.name).toBeDefined();
      expect(competition.competitionGroup).toBeUndefined();
      expect(competition.era).toBeUndefined();
      expect(competition.type).toBeUndefined();
      expect(competition.startDate).toBeUndefined();
      expect(competition.endDate).toBeUndefined();
    }
  });

  it('curates every era each competition can reference', () => {
    const data = readPhase('before-other-importers');
    const leagueIds = new Set(
      data.leagues.flatMap((league) =>
        league.externalIds.map((ref) => `${ref.system}|${ref.id}`),
      ),
    );

    expect(data.eras).toHaveLength(8);
    for (const era of data.eras) {
      expect(leagueIds).toContain(`${era.league!.system}|${era.league!.id}`);
      expect(
        era.startDate,
        `era "${era.name}" has no start date`,
      ).toBeDefined();
      expect(era.externalIds).toContainEqual({ system: 'Name', id: era.name });
    }
  });

  it('classifies every curated trophy into a curated group', () => {
    const data = readPhase('before-other-importers');
    const groupNames = new Set(
      data.competitionGroups.map((group) => group.name),
    );

    expect(data.trophies).toHaveLength(43);
    for (const trophy of data.trophies) {
      expect(
        trophy.competitionGroup,
        `trophy "${trophy.name}" has no competitionGroup`,
      ).toBeDefined();
      expect(trophy.competitionGroup!.system).toBe('Name');
      expect(groupNames).toContain(trophy.competitionGroup!.id);
    }
  });

  it('declares the tourplay.net external system in the trophy catalog', () => {
    // Reads trophies.json5 in isolation (not readPhase's pooled result):
    // coaches.json5, races-and-positions.json5, star-players.json5, and
    // teams.json5 all separately declare tourplay.net too, so asserting
    // against the pooled externalSystems would pass even without this file's
    // own declaration.
    const data = readFile('before-other-importers', 'trophies.json5');

    expect(data.externalSystems).toContainEqual({
      name: 'tourplay.net',
      category: 'imported_data_source',
    });
  });

  it('seeds TP external ids for exactly the ten trophies TP awards', () => {
    // TP has so far only tracked 4 competition groups (Major Season, Chaos
    // Cup, Dungeon Bowl, Ogretoberfest). Dungeon Bowl has three catalog
    // trophies of its own; BBL never awarded one, which is why these three carry no
    // `tloeg.bbleague.se` id. TP's award files have so far only contained team-level
    // entries, so only these 10 catalog entries have real TP source data to key on.
    // The composite format is `${disambiguator}-${groupName}`, where the disambiguator
    // is the raw award's `name` when present (Best Stunty / Wooden Spoon share one
    // numeric awardType) and its numeric `awardType` otherwise. Pinned here so the
    // format cannot drift.
    //
    // Kept as a flat array of pairs, not an object keyed by trophy name: a
    // trophy that ever carried two tourplay.net ids would have the second
    // silently overwrite the first in an object, hiding the duplicate
    // instead of failing this assertion.
    const trophies = readPhase('before-other-importers').trophies;
    const tpIds = trophies.flatMap((trophy) =>
      trophy.externalIds
        .filter((ref) => ref.system === 'tourplay.net')
        .map((ref) => [trophy.name, ref.id] as const),
    );

    expect(tpIds).toEqual([
      ['Major Gold', '1-Major Season'],
      ['Major Silver', '2-Major Season'],
      ['Major Bronze', '3-Major Season'],
      ['Major Wooden Spoon', 'Wooden Spoon-Major Season'],
      ['Major Best Stunty', 'Best Stunty-Major Season'],
      ['Chaos Cup', '1-Chaos Cup'],
      ['Ogretoberfest', '1-Ogretoberfest'],
      ['Dungeon Bowl Gold', '1-Dungeon Bowl'],
      ['Dungeon Bowl Silver', '2-Dungeon Bowl'],
      ['Dungeon Bowl Bronze', '3-Dungeon Bowl'],
    ]);
  });

  it('seeds group-scoped BBL external ids for the ambiguous player trophies', () => {
    // Issue #520: BBL hands the same player-trophy label out in more than one
    // competition group (a Minor-Season "Deadliest Player", a Chaos Cup
    // "Legendary Player"), so the label alone cannot identify the trophy.
    // Those combinations are seeded as their own rows keyed
    // `${label}-${groupName}`, matching the composite format TP ids already
    // use. Pinned here so the format cannot drift away from what
    // BblTrophyAwardsImportService looks up.
    const trophies = readPhase('before-other-importers').trophies;
    const compositeIds = trophies.flatMap((trophy) =>
      trophy.externalIds
        .filter(
          (ref) => ref.system === 'tloeg.bbleague.se' && ref.id.includes('-'),
        )
        .map((ref) => ref.id),
    );

    expect(compositeIds).toEqual([
      'Top Scorer-Minor Season',
      'Most Violent Player-Minor Season',
      'Deadliest Player-Minor Season',
      'Top Fouler-Minor Season',
      'Top Thrower-Minor Season',
      'Top Intercepter-Minor Season',
      'Most SPP-Minor Season',
      'Legendary Player-Chaos Cup',
      'Legendary Player-Ogretoberfest',
      'Legendary Player-Champion of tLoEG',
      'Trogen Tjänst-Moot Mania',
      'Trogen Tjänst-Chaos Cup',
    ]);
  });

  it('has no curated trophy relying on the empty-externalIds name-match fallback', () => {
    // TrophiesService.upsert() still supports matching a trophy by exact
    // name when externalIds is empty (see its doc comment), but no curated
    // trophy uses that path today -- Ogretoberfest was the last one to, and
    // gained a tourplay.net id in issue #446. Pinned here so a future edit
    // that strips a trophy's only external id doesn't silently start relying
    // on the fallback again without anyone noticing.
    const trophies = readPhase('before-other-importers').trophies;
    for (const trophy of trophies) {
      expect(
        trophy.externalIds.length,
        `trophy "${trophy.name}" has no external ids`,
      ).toBeGreaterThan(0);
    }
  });

  it('classifies all 86 known competition instances into curated groups', () => {
    const before = readPhase('before-other-importers');
    const groupNames = new Set(
      before.competitionGroups.map((group) => group.name),
    );
    const eraNames = new Set(before.eras.map((era) => era.name));
    const competitions = before.competitions;

    expect(competitions).toHaveLength(86);
    const keys = new Set<string>();
    for (const competition of competitions) {
      expect(competition.externalIds).toHaveLength(1);
      const [ref] = competition.externalIds;
      const key = `${ref.system}|${ref.id}`;
      expect(keys, `duplicate external id ${key}`).not.toContain(key);
      keys.add(key);
      expect(
        competition.competitionGroup,
        `competition ${key} has no competitionGroup`,
      ).toBeDefined();
      expect(competition.competitionGroup!.system).toBe('Name');
      expect(groupNames).toContain(competition.competitionGroup!.id);
      // The create path needs every NOT NULL column competitions has no
      // default for: name, type, era_id and start_date.
      expect(competition.name, `competition ${key} has no name`).toBeDefined();
      expect(competition.type, `competition ${key} has no type`).toBeDefined();
      expect(competition.era, `competition ${key} has no era`).toBeDefined();
      expect(competition.era!.system).toBe('Name');
      expect(eraNames, `competition ${key} names an uncurated era`).toContain(
        competition.era!.id,
      );
      expect(
        competition.startDate,
        `competition ${key} has no start date`,
      ).toBeDefined();
    }
  });
});
