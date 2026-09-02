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

  it('classifies every curated trophy into a curated group or league', () => {
    const data = readPhase('before-other-importers');
    const groupNames = new Set(
      data.competitionGroups.map((group) => group.name),
    );
    const leagueIds = new Set(
      data.leagues.flatMap((league) =>
        league.externalIds.map((ref) => `${ref.system}|${ref.id}`),
      ),
    );

    expect(data.trophies).toHaveLength(38);
    for (const trophy of data.trophies) {
      if (trophy.league) {
        expect(leagueIds).toContain(
          `${trophy.league.system}|${trophy.league.id}`,
        );
        expect(trophy.competitionGroup).toBeUndefined();
      } else {
        expect(
          trophy.competitionGroup,
          `trophy "${trophy.name}" has no competitionGroup or league`,
        ).toBeDefined();
        expect(trophy.competitionGroup!.system).toBe('Name');
        expect(groupNames).toContain(trophy.competitionGroup!.id);
      }
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

  it('seeds a composite BBL external id for every ambiguous player trophy', () => {
    // BBL hands the same player-trophy label out in more than one
    // competition group (a Major-Season "Deadliest Player", a Minor-Season
    // "Deadliest Player"), so the label alone cannot identify the trophy.
    // Every one of these player trophies -- including its original Major
    // Season row -- is therefore keyed by the composite
    // `${label}-${groupName}` BBL external id, matching the composite format
    // TP ids already use, with no bare-label exception for Major Season.
    // Pinned here so the format cannot drift away from what
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
      'Season MVP-Major Season',
      'Top Scorer-Major Season',
      'Most Violent Player-Major Season',
      'Deadliest Player-Major Season',
      'Top Fouler-Major Season',
      'Top Thrower-Major Season',
      'Top Intercepter-Major Season',
      'Most SPP-Major Season',
      'Top Scorer-Minor Season',
      'Most Violent Player-Minor Season',
      'Deadliest Player-Minor Season',
      'Top Fouler-Minor Season',
      'Top Thrower-Minor Season',
      'Top Intercepter-Minor Season',
      'Most SPP-Minor Season',
    ]);
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

  it('curates CRP characteristics with no Passing value', () => {
    const entries = readFile(
      'after-other-importers',
      'position-characteristics.json5',
    ).positionRulesSets;
    const crp = entries.filter((entry) => entry.rulesSet.id === 'CRP');

    // CRP declares passingFormat: 'absent', so a Passing value here would be
    // rejected by the API at import time rather than caught in review.
    expect(crp.length).toBeGreaterThan(0);
    for (const entry of crp) {
      expect(entry.passing).toBeUndefined();
    }
  });

  it('curates every characteristics entry against a known rules set and a "Name" position id', () => {
    const data = readFile(
      'after-other-importers',
      'position-characteristics.json5',
    );

    expect(data.externalSystems).toContainEqual({
      name: 'Name',
      category: 'bookkeeping',
    });
    for (const entry of data.positionRulesSets) {
      expect(entry.rulesSet.system).toBe('Name');
      expect(['CRP', 'CRP+', 'BB2016', 'BB2020']).toContain(entry.rulesSet.id);
      expect(entry.position.system).toBe('Name');
      expect(entry.position.id.length).toBeGreaterThan(0);
    }
  });

  it('never curates the same position twice under one rules set', () => {
    const entries = readFile(
      'after-other-importers',
      'position-characteristics.json5',
    ).positionRulesSets;
    const keys = entries.map(
      (entry) => `${entry.position.id}|${entry.rulesSet.id}`,
    );

    // position_rules_sets is unique on (position_id, rules_set_id): a
    // duplicate here means the second entry silently overwrites the first.
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('curates CRP characteristics for the six teams on the first roster page', () => {
    const entries = readFile(
      'after-other-importers',
      'position-characteristics.json5',
    ).positionRulesSets;
    const darkElfLineman = entries.find(
      (entry) =>
        entry.rulesSet.id === 'CRP' &&
        entry.position.id === 'Dark Elf Team: Dark Elf Lineman',
    );

    expect(darkElfLineman).toEqual({
      position: { system: 'Name', id: 'Dark Elf Team: Dark Elf Lineman' },
      rulesSet: { system: 'Name', id: 'CRP' },
      move: 6,
      strength: 3,
      agility: 4,
      armour: 8,
    });
  });

  it('curates CRP characteristics for the core-rulebook teams', () => {
    const entries = readFile(
      'after-other-importers',
      'position-characteristics.json5',
    ).positionRulesSets;
    const crpRaces = new Set(
      entries
        .filter((entry) => entry.rulesSet.id === 'CRP')
        .map((entry) => entry.position.id.split(': ')[0]),
    );

    // The Competition Rules Pack lists 21 official races across its three
    // roster pages (p.23-25); all three pages are now covered. Stunty Leeg
    // teams are curated separately and are not part of this count.
    expect(crpRaces.size).toBeGreaterThanOrEqual(21);
  });

  it('curates CRP+ characteristics with no Passing value', () => {
    const entries = readFile(
      'after-other-importers',
      'position-characteristics.json5',
    ).positionRulesSets;
    const crpPlus = entries.filter((entry) => entry.rulesSet.id === 'CRP+');
    const races = new Set(
      crpPlus.map((entry) => entry.position.id.split(': ')[0]),
    );

    // NTBB2015 republishes 24 team lists, now fully covered (pages 3-8).
    // Chaos Pact (NTBB2015 p.3) has no matching race at all in the inventory
    // -- see the // UNMATCHED: block below -- so only 23 of the 24 team
    // lists actually gain entries here.
    expect(races.size).toBeGreaterThanOrEqual(23);
    for (const entry of crpPlus) {
      expect(entry.passing).toBeUndefined();
    }
  });

  it('curates position availability against real races and eras only', () => {
    const data = readFile(
      'before-other-importers',
      'position-availability.json5',
    );

    expect(data.externalSystems).toContainEqual({
      name: 'Name',
      category: 'bookkeeping',
    });
    expect(data.positions.length).toBeGreaterThan(0);
    for (const position of data.positions) {
      // Every entry exists to add raceEras -- an entry with none would
      // silently do nothing but re-upsert the position's own name.
      expect(position.raceEras.length).toBeGreaterThan(0);
      expect(position.externalIds).toContainEqual(
        expect.objectContaining({ system: 'Name' }),
      );
      for (const raceEra of position.raceEras) {
        expect(raceEra.era.system).toBe('Name');
        expect([
          'First era',
          'Second era',
          'First Stunty Leeg era',
          'First Dungeon Bowl era',
          'GBBL 1',
          'Third era',
          'Second Dungeon Bowl era',
          'Fourth era',
        ]).toContain(raceEra.era.id);
      }
    }
  });

  it('never curates the same position/race/era availability twice', () => {
    const positions = readFile(
      'before-other-importers',
      'position-availability.json5',
    ).positions;
    const keys = positions.flatMap((position) =>
      position.raceEras.map(
        (raceEra) =>
          `${position.externalIds[0].id}|${raceEra.race.system}:${raceEra.race.id}|${raceEra.era.id}`,
      ),
    );

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('curates CRP-era availability for the CRP+-only team lists', () => {
    const positions = readFile(
      'before-other-importers',
      'position-availability.json5',
    ).positions;
    const nameIds = positions.flatMap((position) =>
      position.externalIds
        .filter((ref) => ref.system === 'Name')
        .map((ref) => ref.id),
    );

    // Chaos Pact, Slann and Underworld appear in NTBB2015 but not in the CRP
    // core book, so nothing in the source data evidences them for the
    // CRP-era eras.
    expect(
      nameIds.some((id) => id.startsWith('Underworld Denizens Team: ')),
    ).toBe(true);
  });
});
