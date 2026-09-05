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
    const findCrp = (positionId: string) =>
      entries.find(
        (entry) =>
          entry.rulesSet.id === 'CRP' && entry.position.id === positionId,
      );

    expect(findCrp('Dark Elf: Dark Elf Lineman')).toEqual({
      position: { system: 'Name', id: 'Dark Elf: Dark Elf Lineman' },
      rulesSet: { system: 'Name', id: 'CRP' },
      move: 6,
      strength: 3,
      agility: 4,
      armour: 8,
    });
    expect(findCrp('Dwarf: Dwarf Blocker Linemen')).toEqual({
      position: { system: 'Name', id: 'Dwarf: Dwarf Blocker Linemen' },
      rulesSet: { system: 'Name', id: 'CRP' },
      move: 4,
      strength: 3,
      agility: 2,
      armour: 9,
    });
    expect(findCrp('Amazon: Tribal Linewoman')).toEqual({
      position: { system: 'Name', id: 'Amazon: Tribal Linewoman' },
      rulesSet: { system: 'Name', id: 'CRP' },
      move: 6,
      strength: 3,
      agility: 3,
      armour: 7,
    });
    expect(findCrp('Elven Union: Elven Linemen')).toEqual({
      position: { system: 'Name', id: 'Elven Union: Elven Linemen' },
      rulesSet: { system: 'Name', id: 'CRP' },
      move: 6,
      strength: 3,
      agility: 4,
      armour: 7,
    });
    expect(findCrp('Chaos Chosen: Beastman Runner Lineman')).toEqual({
      position: {
        system: 'Name',
        id: 'Chaos Chosen: Beastman Runner Lineman',
      },
      rulesSet: { system: 'Name', id: 'CRP' },
      move: 6,
      strength: 3,
      agility: 3,
      armour: 8,
    });
    expect(findCrp('Chaos Dwarf: Hobgoblin Linemen')).toEqual({
      position: { system: 'Name', id: 'Chaos Dwarf: Hobgoblin Linemen' },
      rulesSet: { system: 'Name', id: 'CRP' },
      move: 6,
      strength: 3,
      agility: 3,
      armour: 7,
    });
  });

  it('keys every curated position by the canonical race name', () => {
    const ids = [
      ...readFile(
        'before-other-importers',
        'races-and-positions.json5',
      ).positions.flatMap((position) =>
        position.externalIds
          .filter((ref) => ref.system === 'Name')
          .map((ref) => ref.id),
      ),
      ...readFile(
        'after-other-importers',
        'position-availability.json5',
      ).positions.flatMap((position) =>
        position.externalIds
          .filter((ref) => ref.system === 'Name')
          .map((ref) => ref.id),
      ),
      ...readFile(
        'after-other-importers',
        'position-characteristics.json5',
      ).positionRulesSets.map((entry) => entry.position.id),
    ];

    // tools/import-bbl canonicalizes its team-page race name
    // ("Underworld Denizens Team", "Wood Elf Teams") down to the race's real
    // name before building this id (BblRaceNameService strips both the
    // singular and plural " Team"/" Teams" suffix), and tools/import-tp
    // always used the real name. A curated id carrying either old spelling
    // would match neither importer: it would create an orphan position row
    // and then collide with the real one (PositionUpsertConflictError).
    expect(ids.filter((id) => id.includes(' Team: '))).toEqual([]);
    expect(ids.filter((id) => id.includes(' Teams: '))).toEqual([]);
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

    // 21 core-rulebook teams plus the Stunty Leeg lists (Albion Fae, Chaos
    // Halflings, Goblin Cheaters, Horrors of Tzeentch, Pygmies, Skinks), which
    // are a CRP-era supplement rather than a rules set of their own.
    expect(crpRaces.size).toBeGreaterThanOrEqual(27);
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
      'after-other-importers',
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
      'after-other-importers',
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
      'after-other-importers',
      'position-availability.json5',
    ).positions;
    const hasFirstEraFor = (prefix: string) =>
      positions.some(
        (position) =>
          position.externalIds.some(
            (ref) => ref.system === 'Name' && ref.id.startsWith(prefix),
          ) &&
          position.raceEras.some((raceEra) => raceEra.era.id === 'First era'),
      );

    // Chaos Pact, Slann and Underworld appear in NTBB2015 but not in the CRP
    // core book, so nothing in the source data evidences them for the
    // CRP-era eras.
    expect(hasFirstEraFor('Underworld Denizens: ')).toBe(true);
    expect(hasFirstEraFor('Slann: ')).toBe(true);
  });

  it('curates availability for the Stunty Leeg era', () => {
    const positions = readFile(
      'after-other-importers',
      'position-availability.json5',
    ).positions;
    const stuntyEraRows = positions.flatMap((position) =>
      position.raceEras.filter(
        (raceEra) => raceEra.era.id === 'First Stunty Leeg era',
      ),
    );

    // The Stunty Leeg era is short and sparsely recorded, so it is exactly
    // where the importer's evidence rule leaves genuine availability
    // unasserted.
    expect(stuntyEraRows.length).toBeGreaterThan(0);
  });

  it('curates every BB2020 characteristics entry with a Passing value', () => {
    const entries = readFile(
      'after-other-importers',
      'position-characteristics.json5',
    ).positionRulesSets;
    const bb2020 = entries.filter((entry) => entry.rulesSet.id === 'BB2020');

    // BB2020 declares passingFormat: 'plus_zero_legal'; an entry omitting
    // Passing is rejected by the API at import time. The 1..6 bound below is
    // about the curated data as it stands, not about what the format permits:
    // a 0 would be legal under this format (meaning "structurally cannot
    // pass"), and nothing curated here uses one yet.
    expect(bb2020.length).toBeGreaterThan(0);
    for (const entry of bb2020) {
      expect(entry.passing).toBeDefined();
      // Target numbers, so a plausible range rather than an exact value.
      expect(entry.passing).toBeGreaterThanOrEqual(1);
      expect(entry.passing).toBeLessThanOrEqual(6);
      expect(entry.agility).toBeGreaterThanOrEqual(1);
      expect(entry.agility).toBeLessThanOrEqual(6);
      expect(entry.armour).toBeGreaterThanOrEqual(1);
      expect(entry.armour).toBeLessThanOrEqual(12);
    }
  });

  it('curates BB2016 characteristics with no Passing value', () => {
    const entries = readFile(
      'after-other-importers',
      'position-characteristics.json5',
    ).positionRulesSets;
    const bb2016 = entries.filter((entry) => entry.rulesSet.id === 'BB2016');
    const races = new Set(
      bb2016.map((entry) => entry.position.id.split(': ')[0]),
    );

    // Teams of Legend covers 14 CRP-legacy races; the 4 boxed-set races
    // (Human, Orc, Dwarf, Skaven) and the 6 further CRP-legacy races Teams of
    // Legend itself skipped (Dark Elf, Elven Union, High Elf, Wood Elf,
    // Nurgle, Slann) are transcribed from the physical rulebooks (Task 14).
    expect(races.size).toBeGreaterThanOrEqual(24);
    for (const entry of bb2016) {
      expect(entry.passing).toBeUndefined();
    }
  });

  it('curates BB2016 characteristics for every position that had a CRP row', () => {
    // BB2016 dropped a handful of CRP positions outright; each exception is
    // listed here so the assertion documents them instead of hiding them
    // behind a count.
    const droppedInBb2016: string[] = [
      'SL - Albion Fae: SL - Brownies',
      'SL - Albion Fae: SL - Pixies',
      'SL - Albion Fae: SL - Leprechauns',
      'SL - Albion Fae: SL - Fenbeast',
      'SL - Chaos Halflings: Chaos Halfling',
      'SL - Chaos Halflings: SL - Head Carver',
      'SL - Chaos Halflings: SL - Carvers',
      'SL - Chaos Halflings: SL - Chaos Spawn',
      'SL - Goblin Cheaters: SL - Goblin',
      'SL - Goblin Cheaters: SL - Looney',
      'SL - Goblin Cheaters: SL - Bombers',
      'SL - Goblin Cheaters: SL - Fanatic',
      'SL - Goblin Cheaters: SL - Kickers',
      'SL - Goblin Cheaters: SL - Pogo Stick',
      'SL - Horrors Of Tzeentch: SL - Horror',
      'SL - Horrors Of Tzeentch: SL - Greater Horror',
      'SL - Horrors Of Tzeentch: SL - Flamers',
      'SL - Horrors Of Tzeentch: SL - Fire Wyrms',
      'SL - Pygmies: SL - Pygmies',
      'SL - Pygmies: SL - Alligator Warriors',
      'SL - Pygmies: SL - Eagle Warriors',
      'SL - Pygmies: SL - Jaguar Warriors',
      'SL - Pygmies: SL - Kroxigor',
      'SL - Skinks: SL - Skinks',
      'SL - Skinks: SL - Whiptails',
      'SL - Skinks: SL - Adept of Sotek',
      'SL - Skinks: SL - Raptors',
    ];
    const entries = readFile(
      'after-other-importers',
      'position-characteristics.json5',
    ).positionRulesSets;
    const bb2016 = new Set(
      entries
        .filter((entry) => entry.rulesSet.id === 'BB2016')
        .map((entry) => entry.position.id),
    );
    const crp = new Set(
      entries
        .filter((entry) => entry.rulesSet.id === 'CRP')
        .map((entry) => entry.position.id),
    );

    // "First era" and "First Stunty Leeg era" span CRP, CRP+ and BB2016
    // together, so a position curated for CRP was playable under BB2016 too
    // unless BB2016 dropped its team list.
    expect([...crp].filter((id) => !bb2016.has(id)).sort()).toEqual(
      [...droppedInBb2016].sort(),
    );
  });

  it('curates a First-era (or First Stunty Leeg era) availability row for every CRP/CRP+/BB2016 characteristics entry', () => {
    // Positions where a curated CRP/CRP+/BB2016 characteristics entry exists
    // but no matching availability row is appropriate. Empty: every curated
    // position below has a matching availability row.
    const exceptions: string[] = [];

    const characteristics = readFile(
      'after-other-importers',
      'position-characteristics.json5',
    ).positionRulesSets;
    const availability = readFile(
      'after-other-importers',
      'position-availability.json5',
    ).positions;

    const curatedIds = new Set(
      characteristics
        .filter((entry) =>
          ['CRP', 'CRP+', 'BB2016'].includes(entry.rulesSet.id),
        )
        .map((entry) => entry.position.id),
    );

    // Every raceEra below references its race by the "tloeg.bbleague.se"
    // numeric id, not by name, so a race name has to be recovered before it
    // can be compared against a characteristics position id's "<race>: ..."
    // prefix. Every position in this file re-states its own race in its
    // "Name" external id (id.split(': ')[0]), so that -- paired with the
    // same entry's raceEras -- is enough to build a numeric-id-to-race-name
    // lookup without needing the database.
    const raceNameByBblId = new Map<string, string>();
    for (const position of availability) {
      const nameIds = position.externalIds
        .filter((ref) => ref.system === 'Name' && ref.id.includes(': '))
        .map((ref) => ref.id);
      for (const nameId of nameIds) {
        const race = nameId.split(': ')[0];
        for (const raceEra of position.raceEras) {
          if (raceEra.race.system === 'tloeg.bbleague.se') {
            raceNameByBblId.set(raceEra.race.id, race);
          }
        }
      }
    }

    const eraRaceByPositionId = new Map<string, Set<string>>();
    for (const position of availability) {
      const nameIds = position.externalIds
        .filter((ref) => ref.system === 'Name')
        .map((ref) => ref.id);
      for (const nameId of nameIds) {
        const eraRaces = eraRaceByPositionId.get(nameId) ?? new Set<string>();
        for (const raceEra of position.raceEras) {
          const race = raceNameByBblId.get(raceEra.race.id);
          eraRaces.add(`${raceEra.era.id}|${race}`);
        }
        eraRaceByPositionId.set(nameId, eraRaces);
      }
    }

    // Stunty Leeg positions are keyed under "First Stunty Leeg era" rather
    // than "First era"; every Stunty Leeg race name is prefixed "SL - ", so
    // the position id (built as "<race>: <name>") is too.
    const missing = [...curatedIds]
      .filter((id) => {
        const expectedEra = id.startsWith('SL - ')
          ? 'First Stunty Leeg era'
          : 'First era';
        const expectedRace = id.split(': ')[0];
        return !eraRaceByPositionId
          .get(id)
          ?.has(`${expectedEra}|${expectedRace}`);
      })
      .sort();

    expect(missing).toEqual(exceptions);
  });

  it('pre-registers the Halfling roster lineman as one row across its rename', () => {
    const positions = readFile(
      'before-other-importers',
      'races-and-positions.json5',
    ).positions;
    const entry = positions.find(
      (position) =>
        position.name === 'Halfling Hopeful' &&
        position.externalIds.some(
          (ref) => ref.system === 'tourplay.net' && ref.id === '969',
        ),
    );

    // TP renamed this position between rules-set generations ('Halfling
    // Hopeful Lineman', id 297, on the older rosters; 'Halfling Hopeful', id
    // 969, on BB2025), and BBL still uses the older name (typId 39, race 8).
    // Registering all three ids up front lands every source's upsert on this
    // single row instead of three. The Name id matches this file's own
    // convention of pre-registering one so the after-other-importers
    // availability phase (which references this same Name id) can never race
    // BBL/TP into creating an orphan row before either source has run.
    expect(entry?.externalIds).toEqual([
      { system: 'tloeg.bbleague.se', id: '39-8' },
      { system: 'tourplay.net', id: '969' },
      { system: 'tourplay.net', id: '297' },
      { system: 'Name', id: 'Halfling: Halfling Hopeful Lineman' },
    ]);
    expect(entry?.isStarPlayer).toBe(false);
  });

  it('curates the Halfling roster lineman under its post-rename name', () => {
    const positions = readFile(
      'after-other-importers',
      'position-availability.json5',
    ).positions;
    const entry = positions.find((position) =>
      position.externalIds.some(
        (ref) =>
          ref.system === 'Name' &&
          ref.id === 'Halfling: Halfling Hopeful Lineman',
      ),
    );

    // This phase overlays the position's name, so it has to re-state the
    // merged row's final name rather than the older spelling its Name id uses.
    expect(entry?.name).toBe('Halfling Hopeful');
  });

  /**
   * Every other instance of the same cross-rules-set-rename pattern as the
   * Halfling Hopeful case above: a curated row that pre-registers every
   * source's id (so a BB2025-only id upserts onto the existing row instead of
   * splitting off a second, disconnected one). Four of these also got renamed
   * between rules-set generations and so carry an `overlay` -- the
   * after-other-importers position-availability.json5 entry that re-states
   * the row's post-rename name against its BBL/TP-rebuilt Name id (which
   * differs from the row's own original Name id below by pluralization).
   */
  const CROSS_RULES_SET_MERGES = [
    {
      race: 'Lizardmen',
      name: 'Chameleon Skink',
      externalIds: [
        { system: 'tloeg.bbleague.se', id: '286-12' },
        { system: 'tourplay.net', id: '985' },
        { system: 'tourplay.net', id: '313' },
        { system: 'Name', id: 'Lizardmen: Chameleon Skink' },
      ],
      overlay: null,
    },
    {
      race: 'Lizardmen',
      name: 'Saurus Blocker',
      externalIds: [
        { system: 'tloeg.bbleague.se', id: '81-12' },
        { system: 'tourplay.net', id: '986' },
        { system: 'tourplay.net', id: '314' },
        { system: 'Name', id: 'Lizardmen: Saurus Blocker' },
      ],
      overlay: null,
    },
    {
      race: 'Lizardmen',
      name: 'Skink Lineman',
      externalIds: [
        { system: 'tloeg.bbleague.se', id: '88-12' },
        { system: 'tourplay.net', id: '984' },
        { system: 'tourplay.net', id: '312' },
        { system: 'Name', id: 'Lizardmen: Skink Runner Lineman' },
      ],
      overlay: {
        nameId: 'Lizardmen: Skink Runner Linemen',
        name: 'Skink Lineman',
      },
    },
    {
      race: 'Dwarf',
      name: 'Dwarf Lineman',
      externalIds: [
        { system: 'tloeg.bbleague.se', id: '57-5' },
        { system: 'tourplay.net', id: '952' },
        { system: 'tourplay.net', id: '280' },
        { system: 'Name', id: 'Dwarf: Dwarf Blocker Lineman' },
      ],
      overlay: {
        nameId: 'Dwarf: Dwarf Blocker Linemen',
        name: 'Dwarf Lineman',
      },
    },
    {
      race: 'Goblin',
      name: 'Goblin Lineman',
      externalIds: [
        { system: 'tloeg.bbleague.se', id: '33-7' },
        { system: 'tourplay.net', id: '961' },
        { system: 'tourplay.net', id: '289' },
        { system: 'Name', id: 'Goblin: Goblin Lineman' },
      ],
      overlay: null,
    },
    {
      race: 'Goblin',
      name: 'Ooligan',
      externalIds: [
        { system: 'tloeg.bbleague.se', id: '232-7' },
        { system: 'tourplay.net', id: '964' },
        { system: 'tourplay.net', id: '294' },
        { system: 'Name', id: 'Goblin: ’Ooligan' },
      ],
      overlay: null,
    },
    {
      race: 'Halfling',
      name: 'Altern Forest Treeman',
      externalIds: [
        { system: 'tloeg.bbleague.se', id: '169-8' },
        { system: 'tourplay.net', id: '972' },
        { system: 'tourplay.net', id: '300' },
        { system: 'Name', id: 'Halfling: Altern Forest Treeman' },
      ],
      overlay: null,
    },
    {
      race: 'Norse',
      name: 'Norse Raider',
      externalIds: [
        { system: 'tloeg.bbleague.se', id: '67-14' },
        { system: 'tourplay.net', id: '1058' },
        { system: 'tourplay.net', id: '530' },
        { system: 'Name', id: 'Norse: Norse Raider Lineman' },
      ],
      overlay: { nameId: 'Norse: Norse Raider Linemen', name: 'Norse Raider' },
    },
    {
      race: 'Underworld Denizens',
      name: 'Skaven Blitzer',
      externalIds: [
        { system: 'tloeg.bbleague.se', id: '154-24' },
        { system: 'tourplay.net', id: '1038' },
        { system: 'tourplay.net', id: '366' },
        { system: 'Name', id: 'Underworld Denizens: Skaven Blitzer' },
      ],
      overlay: null,
    },
    {
      race: 'Underworld Denizens',
      name: 'Gutter Runner',
      externalIds: [
        { system: 'tloeg.bbleague.se', id: '293-24' },
        { system: 'tourplay.net', id: '1037' },
        { system: 'tourplay.net', id: '365' },
        { system: 'Name', id: 'Underworld Denizens: Gutter Runner' },
      ],
      overlay: null,
    },
    {
      race: 'Underworld Denizens',
      name: 'Skaven Clanrat',
      externalIds: [
        { system: 'tloeg.bbleague.se', id: '152-24' },
        { system: 'tourplay.net', id: '1035' },
        { system: 'tourplay.net', id: '363' },
        { system: 'Name', id: 'Underworld Denizens: Skaven Clanrat' },
      ],
      overlay: null,
    },
    {
      race: 'Underworld Denizens',
      name: 'Skaven Thrower',
      externalIds: [
        { system: 'tloeg.bbleague.se', id: '153-24' },
        { system: 'tourplay.net', id: '1036' },
        { system: 'tourplay.net', id: '364' },
        { system: 'Name', id: 'Underworld Denizens: Skaven Thrower' },
      ],
      overlay: null,
    },
    {
      race: 'Underworld Denizens',
      name: 'Troll',
      externalIds: [
        { system: 'tloeg.bbleague.se', id: '155-24' },
        { system: 'tourplay.net', id: '1039' },
        { system: 'tourplay.net', id: '367' },
        { system: 'Name', id: 'Underworld Denizens: Underworld Troll' },
      ],
      overlay: {
        nameId: 'Underworld Denizens: Warpstone Troll',
        name: 'Troll',
      },
    },
  ] as const;

  describe.each(CROSS_RULES_SET_MERGES)(
    '$race $name pre-registered across its rename',
    (row) => {
      it('registers every source id on one row in races-and-positions.json5', () => {
        const positions = readFile(
          'before-other-importers',
          'races-and-positions.json5',
        ).positions;
        const ownNameId = row.externalIds.find(
          (ref) => ref.system === 'Name',
        )!.id;
        const entry = positions.find((position) =>
          position.externalIds.some(
            (ref) => ref.system === 'Name' && ref.id === ownNameId,
          ),
        );

        expect(entry?.externalIds).toEqual(row.externalIds);
        expect(entry?.name).toBe(row.name);
        expect(entry?.isStarPlayer).toBe(false);
      });

      if (row.overlay) {
        const overlay = row.overlay;

        it('curates the row under its post-rename name in position-availability.json5', () => {
          const positions = readFile(
            'after-other-importers',
            'position-availability.json5',
          ).positions;
          const entry = positions.find((position) =>
            position.externalIds.some(
              (ref) => ref.system === 'Name' && ref.id === overlay.nameId,
            ),
          );

          expect(entry?.name).toBe(overlay.name);
        });
      }
    },
  );
});
