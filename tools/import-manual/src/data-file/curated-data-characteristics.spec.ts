import { describe, expect, it } from 'vitest';

import { readFile, readPhase } from './curated-data.test-helpers';

describe('curated data files - characteristics', () => {
  it('curates the gap-fill file with both the position and its BB2020 stat line', () => {
    const data = readFile(
      'before-other-importers',
      'position-characteristics-gap-fill.json5',
    );

    // The file must register the position itself: nothing else in the
    // before phase declares it, and without it the positionRulesSets
    // reference cannot resolve.
    const positionIds = data.positions.map((entry) => entry.name);
    for (const entry of data.positionRulesSets) {
      expect(entry.position.system).toBe('Name');
      expect(entry.rulesSet.system).toBe('Name');
      // Every gap-fill entry must carry a Passing value: the only rules set
      // this file curates under is BB2020, whose passingFormat has one.
      expect(entry.rulesSet.id).toBe('BB2020');
      expect(entry.passing).toBeDefined();
    }
    expect(data.positionRulesSets.length).toBeGreaterThan(0);
    expect(positionIds).toContain('Giant Mercenary');
    expect(data.externalSystems).toContainEqual({
      name: 'Name',
      category: 'bookkeeping',
    });
  });

  it('registers every gap-fill position under the external ids the source importers send', () => {
    const data = readFile(
      'before-other-importers',
      'position-characteristics-gap-fill.json5',
    );

    for (const position of data.positions) {
      // A mercenary position is a star-player position on both sides.
      expect(position.isStarPlayer).toBe(true);
      // TP's own upsert sends its tourplay.net id and its "Name" id as the
      // bare position name, so both must be pre-registered here for that
      // upsert to land on this row rather than create a second one.
      expect(position.externalIds).toContainEqual({
        system: 'tourplay.net',
        id: position.name,
      });
      expect(position.externalIds).toContainEqual({
        system: 'Name',
        id: position.name,
      });
    }
    expect(data.positions.length).toBeGreaterThan(0);
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
      expect(['CRP', 'CRP+', 'BB2016']).toContain(entry.rulesSet.id);
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

  it('never curates the same (position, rules set) pair in both characteristics files', () => {
    const afterKeys = new Set(
      readFile(
        'after-other-importers',
        'position-characteristics.json5',
      ).positionRulesSets.map(
        (entry) => `${entry.position.id}|${entry.rulesSet.id}`,
      ),
    );
    const gapFillKeys = readFile(
      'before-other-importers',
      'position-characteristics-gap-fill.json5',
    ).positionRulesSets.map(
      (entry) => `${entry.position.id}|${entry.rulesSet.id}`,
    );

    // Each file's own natural key is already asserted unique within itself;
    // this states directly that PositionRulesSetsService.sync's silent
    // update-in-place risk (see the gap-fill file's header comment) can never
    // arise between the two files either -- today this only holds because the
    // allowed-rules-set list happens not to overlap, but this is the
    // invariant that actually matters.
    const overlap = gapFillKeys.filter((key) => afterKeys.has(key));
    expect(overlap).toEqual([]);
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
      'before-other-importers',
      'position-characteristics-gap-fill.json5',
    ).positionRulesSets;
    const bb2020 = entries.filter((entry) => entry.rulesSet.id === 'BB2020');

    // BB2020 gap-fill entries declare passingFormat: 'plus_zero_legal'; an entry omitting
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
    // Nurgle, Slann) are transcribed from the physical rulebooks.
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

  it('declares agilityFormat as bare for exactly CRP, CRP+ and BB2016', () => {
    const rulesSets = readFile(
      'before-other-importers',
      'spp-award-values.json5',
    ).rulesSets;

    // tools/import-bbl's BblPositionCharacteristicsImportService relies on
    // agilityFormat === 'bare' as the signal for "one of the three rules
    // sets it cannot represent correctly" (see that class's doc comment). If
    // this ever drifted -- a rules set gaining or losing 'bare' without a
    // matching code change -- BBL would silently start writing (or skipping)
    // the wrong rules sets with no test failing, which is exactly the bug
    // class this branch fixes.
    const bare = rulesSets
      .filter((rulesSet) => rulesSet.agilityFormat === 'bare')
      .map((rulesSet) => rulesSet.name)
      .sort();

    expect(bare).toEqual(['BB2016', 'CRP', 'CRP+']);
  });

  it("resolves the gap-fill file's positionRulesSets references against its own phase", () => {
    const gapFill = readFile(
      'before-other-importers',
      'position-characteristics-gap-fill.json5',
    );
    const phase = readPhase('before-other-importers');

    const rulesSetNameIds = new Set(
      phase.rulesSets.flatMap((rulesSet) =>
        rulesSet.externalIds
          .filter((ref) => ref.system === 'Name')
          .map((ref) => ref.id),
      ),
    );
    const positionNameIds = new Set(
      phase.positions.flatMap((position) =>
        position.externalIds
          .filter((ref) => ref.system === 'Name')
          .map((ref) => ref.id),
      ),
    );

    expect(gapFill.positionRulesSets.length).toBeGreaterThan(0);
    for (const entry of gapFill.positionRulesSets) {
      // Both references use the 'Name' system, so resolving them means
      // finding a matching id among the phase's pooled rulesSets/positions --
      // not just this one file's own, since the position may be declared
      // alongside the reference (as the gap-fill file's own header explains)
      // but the rules set is declared elsewhere in the same phase.
      expect(rulesSetNameIds.has(entry.rulesSet.id)).toBe(true);
      expect(positionNameIds.has(entry.position.id)).toBe(true);
    }
  });
});
