import { describe, expect, it } from 'vitest';

import { readFile, readPhase } from './curated-data.test-helpers';

describe('curated data files', () => {
  it('parses every before-other-importers file', () => {
    expect(() => readPhase('before-other-importers')).not.toThrow();
  });

  it('parses every after-other-importers file', () => {
    expect(() => readPhase('after-other-importers')).not.toThrow();
  });

  it('keeps a trophy-awards file for the manual trophies', () => {
    // The file grows one entry at a time as historical winners are
    // established, so nothing here pins its length or contents -- only that
    // it parses and that every entry carries the three references the
    // importer resolves.
    const awards = readFile(
      'after-other-importers',
      'trophy-awards.json5',
    ).trophyAwards;
    for (const award of awards) {
      expect(award.trophy.length).toBeGreaterThan(0);
      expect(award.competition.system.length).toBeGreaterThan(0);
      expect(award.competition.id.length).toBeGreaterThan(0);
      expect(award.player.system.length).toBeGreaterThan(0);
      expect(award.player.id.length).toBeGreaterThan(0);
    }
    // Every entry must name one of the two trophies nothing can
    // compute -- any other trophy's winner comes from the source or a rule.
    const manualTrophies = readPhase('before-other-importers')
      .trophies.filter((trophy) => trophy.awardRuleKind === 'manual')
      .map((trophy) => trophy.name);
    expect(manualTrophies.sort()).toEqual(['Gudarnas Förkämpe', 'Season MVP']);
    for (const award of readPhase('after-other-importers').trophyAwards) {
      expect(manualTrophies).toContain(award.trophy);
    }
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

  it('classifies every curated trophy with an award rule', () => {
    const trophies = readPhase('before-other-importers').trophies;
    for (const trophy of trophies) {
      expect(trophy.awardRuleKind, trophy.name).toBeDefined();
    }
  });

  it('gives every source-recorded and manual trophy a stated procedure', () => {
    const trophies = readPhase('before-other-importers').trophies.filter(
      (trophy) =>
        trophy.awardRuleKind === 'direct_source' ||
        trophy.awardRuleKind === 'manual',
    );
    expect(trophies).toHaveLength(21);
    for (const trophy of trophies) {
      expect(trophy.awardProcedure, trophy.name).toBeTruthy();
      expect(trophy.awardRuleRole, trophy.name).toBeUndefined();
      expect(trophy.awardRuleMatchEventTypes, trophy.name).toEqual([]);
    }
  });

  it('gives every maximum-based trophy a role and the same tie cutoff', () => {
    const trophies = readPhase('before-other-importers').trophies.filter(
      (trophy) =>
        trophy.awardRuleKind === 'max_count' ||
        trophy.awardRuleKind === 'max_spp_sum',
    );
    expect(trophies).toHaveLength(15);
    for (const trophy of trophies) {
      expect(trophy.awardRuleRole, trophy.name).toBeDefined();
      // Real BBL data has ties of up to four, so four is the cutoff everywhere.
      expect(trophy.awardRuleTieCutoff, trophy.name).toBe(4);
      expect(trophy.awardProcedure, trophy.name).toBeUndefined();
    }
  });

  it('gives every career trophy a threshold and a measure', () => {
    const trophies = readPhase('before-other-importers').trophies.filter(
      (trophy) => trophy.awardRuleKind === 'career_threshold',
    );
    expect(trophies.map((trophy) => trophy.name)).toEqual([
      'Legendary Player',
      'Trogen Tjänst',
    ]);
    for (const trophy of trophies) {
      expect(trophy.awardRuleThreshold, trophy.name).toBeGreaterThan(0);
      expect(trophy.awardRuleMeasure, trophy.name).toBeDefined();
      expect(trophy.awardRuleTieCutoff, trophy.name).toBeUndefined();
    }

    // Pinned exactly: these are the two highest-risk career_threshold values
    // in the catalog, since a swap between them (or a typo'd number) would
    // still pass the presence-only checks above.
    const legendaryPlayer = trophies.find(
      (trophy) => trophy.name === 'Legendary Player',
    );
    expect(legendaryPlayer?.awardRuleThreshold).toBe(176);
    expect(legendaryPlayer?.awardRuleMeasure).toBe('spp_sum');

    const trogenTjanst = trophies.find(
      (trophy) => trophy.name === 'Trogen Tjänst',
    );
    expect(trogenTjanst?.awardRuleThreshold).toBe(3);
    expect(trogenTjanst?.awardRuleMeasure).toBe('event_count');
  });

  it('restricts exactly one trophy to specific positions, the Ogre ones', () => {
    const trophies = readPhase('before-other-importers').trophies;
    const restricted = trophies.filter(
      (trophy) => trophy.awardRuleEligiblePositions.length > 0,
    );

    // Pinned exactly. Bierhallenführer is "the Ogre who gets the most Star
    // Player Points", so without this restriction the rule would hand it to
    // whichever non-Ogre topped the competition's SPP table -- and a
    // regression that dropped the Runt Punter (the Ogre roster has more than
    // one Ogre position) would still leave a plausible-looking one-entry
    // list behind.
    expect(restricted.map((trophy) => trophy.name)).toEqual([
      'Bierhallenführer',
    ]);
    expect(restricted[0].awardRuleEligiblePositions).toEqual([
      'Ogre: Ogre Blocker',
      'Ogre: Ogre Runt Punter',
    ]);
    // The Ogre roster's third position. It is an eligible player of the Ogre
    // team, but it is not an Ogre, so it must not be on the list.
    expect(restricted[0].awardRuleEligiblePositions).not.toContain(
      'Ogre: Gnoblar Lineman',
    );
  });

  it('names every eligible position by a "<race>: <position>" Name id', () => {
    const data = readPhase('before-other-importers');
    const raceNames = new Set(data.races.map((race) => race.name));
    const ids = data.trophies.flatMap(
      (trophy) => trophy.awardRuleEligiblePositions,
    );
    expect(ids.length).toBeGreaterThan(0);

    for (const id of ids) {
      // Same id shape NameExternalIdService.forPosition builds, keyed by the
      // canonical race name -- an id carrying BBL's "<Race> Team" spelling
      // would match no position at all, silently awarding nobody.
      expect(id, id).toMatch(/^[^:]+: .+$/);
      expect(id).not.toContain(' Team: ');
      expect(raceNames.has(id.split(': ')[0]), id).toBe(true);
    }
  });

  it('counts every foul, whatever it did', () => {
    const trophies = readPhase('before-other-importers').trophies.filter(
      (trophy) => trophy.name.endsWith('Top Fouler'),
    );
    expect(trophies).toHaveLength(2);
    for (const trophy of trophies) {
      // Pinned exactly: the `foul` action type and nothing else. Adding a
      // consequence type here would silently narrow the trophy to fouls that
      // hurt somebody, which is not what it awards.
      expect(trophy.awardRuleMatchEventTypes, trophy.name).toEqual([
        { actionType: 'foul' },
      ]);
    }
  });

  it('gives every other max_count trophy its exact match-event types', () => {
    const trophies = readPhase('before-other-importers').trophies;
    const findAll = (...names: string[]) =>
      names.map((name) => {
        const trophy = trophies.find((candidate) => candidate.name === name);
        expect(trophy, name).toBeDefined();
        return trophy!;
      });

    for (const trophy of findAll('Top Scorer', 'Minor Top Scorer')) {
      expect(trophy.awardRuleMatchEventTypes, trophy.name).toEqual([
        { actionType: 'touchdown' },
      ]);
    }

    for (const trophy of findAll(
      'Most Violent Player',
      'Minor Most Violent Player',
    )) {
      expect(trophy.awardRuleMatchEventTypes, trophy.name).toEqual([
        { actionType: 'casualty' },
        { actionType: 'badly_hurt' },
        { actionType: 'serious_injury' },
        { actionType: 'death' },
      ]);
    }

    for (const trophy of findAll(
      'Deadliest Player',
      'Minor Deadliest Player',
    )) {
      expect(trophy.awardRuleMatchEventTypes, trophy.name).toEqual([
        { actionType: 'death' },
      ]);
    }

    for (const trophy of findAll('Top Thrower', 'Minor Top Thrower')) {
      expect(trophy.awardRuleMatchEventTypes, trophy.name).toEqual([
        { actionType: 'completion' },
      ]);
    }

    // Interceptions only -- deliberately NOT including `deflection`, a
    // distinct action type this rule must not sweep in.
    for (const trophy of findAll('Top Intercepter', 'Minor Top Intercepter')) {
      expect(trophy.awardRuleMatchEventTypes, trophy.name).toEqual([
        { actionType: 'interception' },
      ]);
    }
  });

  it('excludes MVP awards from the Bierhallenführer SPP sum', () => {
    const trophy = readPhase('before-other-importers').trophies.find(
      (candidate) => candidate.name === 'Bierhallenführer',
    );
    expect(trophy?.awardRuleExcludedMatchEventTypes).toEqual([
      { actionType: 'mvp_award' },
    ]);
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
