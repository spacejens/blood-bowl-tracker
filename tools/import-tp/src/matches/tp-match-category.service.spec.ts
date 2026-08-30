import type { TpMatch } from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { ClassifyTpMatchOptions } from './tp-match-category.service';
import { TpMatchCategoryService } from './tp-match-category.service';

/**
 * A minimal `TpMatch`, only the fields `TpMatchCategoryService` reads
 * (`phaseOrder`, `round`, `homeTeamTpId`, `awayTeamTpId`, `winner`) are
 * meaningful; the rest are filled with unrelated placeholder values.
 */
function match(overrides: Partial<TpMatch> & { id: number }): TpMatch {
  return {
    playedDate: new Date('2024-01-01'),
    name: 'Round 1',
    homeTeamTpId: 1,
    awayTeamTpId: 2,
    matchEvents: [],
    homeRosterPlayers: [],
    awayRosterPlayers: [],
    phaseType: 160,
    phaseOrder: 1,
    round: 1,
    winner: 'home',
    ...overrides,
  };
}

/**
 * The 6-match "qualifier -> semifinal -> final+bronze" shape seen in most
 * real season competitions (e.g. tloegbbl-major-season-25), reconstructed
 * from real fixture data by tracing team ids and scoreResume.winner across
 * rounds (see docs/import-tp/file-format-match.md and task-7-report.md for the
 * evidence). Team ids: 1 v 2 and 3 v 4 in the qualifier; the qualifier
 * winners (here, 1 and 3) advance to face two new bye-seeded teams (5, 7) in
 * the semifinal; the semifinal winners (here, 1 and 5) meet in the final,
 * and the semifinal losers (7 and 3) meet in the bronze match.
 */
function sixMatchSeason(): TpMatch[] {
  return [
    // Qualifier: order 2, round 1.
    match({
      id: 1,
      phaseOrder: 2,
      round: 1,
      homeTeamTpId: 1,
      awayTeamTpId: 2,
      winner: 'home', // 1 beats 2
    }),
    match({
      id: 2,
      phaseOrder: 2,
      round: 1,
      homeTeamTpId: 3,
      awayTeamTpId: 4,
      winner: 'home', // 3 beats 4
    }),
    // Semifinal: order 3, round 1.
    match({
      id: 3,
      phaseOrder: 3,
      round: 1,
      homeTeamTpId: 5,
      awayTeamTpId: 3,
      winner: 'home', // 5 beats 3
    }),
    match({
      id: 4,
      phaseOrder: 3,
      round: 1,
      homeTeamTpId: 1,
      awayTeamTpId: 7,
      winner: 'away', // 7 beats 1
    }),
    // Terminal: order 3, round 2 -- final (5 v 7, both semifinal winners) and
    // bronze (3 v 1, both semifinal losers).
    match({
      id: 5,
      phaseOrder: 3,
      round: 2,
      homeTeamTpId: 5,
      awayTeamTpId: 7,
      winner: 'home', // final: 5 beats 7
    }),
    match({
      id: 6,
      phaseOrder: 3,
      round: 2,
      homeTeamTpId: 3,
      awayTeamTpId: 1,
      winner: 'away', // bronze: 1 beats 3
    }),
  ];
}

/**
 * The 4-match "semifinal -> final+bronze" shape (no qualifier), for a season
 * that skips qualifying entirely. No local fixture has this shape -- it's a
 * developer-stated rule ("if there are only 4 non-normal matches in a
 * season, that means qualifying rounds were not used"), not one derived from
 * real data. Same team-id story as {@link sixMatchSeason} minus the
 * qualifier: teams 1, 3, 5, 7 go directly into the semifinal.
 */
function fourMatchSeason(): TpMatch[] {
  return [
    // Semifinal: order 2, round 2 (an arbitrary (order, round) pair, chosen
    // to prove the stage is found by sorted (order, round) position, not
    // fixed numbers).
    match({
      id: 1,
      phaseOrder: 2,
      round: 2,
      homeTeamTpId: 5,
      awayTeamTpId: 3,
      winner: 'home', // 5 beats 3
    }),
    match({
      id: 2,
      phaseOrder: 2,
      round: 2,
      homeTeamTpId: 1,
      awayTeamTpId: 7,
      winner: 'away', // 7 beats 1
    }),
    // Terminal: order 3, round 1.
    match({
      id: 3,
      phaseOrder: 3,
      round: 1,
      homeTeamTpId: 5,
      awayTeamTpId: 7,
      winner: 'home', // final: 5 beats 7
    }),
    match({
      id: 4,
      phaseOrder: 3,
      round: 1,
      homeTeamTpId: 3,
      awayTeamTpId: 1,
      winner: 'away', // bronze: 1 beats 3
    }),
  ];
}

/**
 * The real `tloegbbl-sasong-28` grouping: still the 6-match "qualifier ->
 * semifinal -> final+bronze" shape, but with the qualifier AND semifinal
 * both falling under `phaseOrder 2` (rounds 1 and 2) and the terminal stage
 * alone under `phaseOrder 3` (round 1) -- the reverse of every other
 * season's `(2,1)`/`(3,1)`/`(3,2)` grouping. Proves stages are found by
 * ascending `(phaseOrder, round)` position, not by phase-type/order numbers.
 * Same team-id story as {@link sixMatchSeason}.
 */
function sixMatchSeasonInvertedGrouping(): TpMatch[] {
  return [
    // Qualifier: order 2, round 1.
    match({
      id: 1,
      phaseOrder: 2,
      round: 1,
      homeTeamTpId: 1,
      awayTeamTpId: 2,
      winner: 'home', // 1 beats 2
    }),
    match({
      id: 2,
      phaseOrder: 2,
      round: 1,
      homeTeamTpId: 3,
      awayTeamTpId: 4,
      winner: 'home', // 3 beats 4
    }),
    // Semifinal: order 2, round 2 (still phaseOrder 2, unlike the normal
    // grouping where the semifinal moves to phaseOrder 3).
    match({
      id: 3,
      phaseOrder: 2,
      round: 2,
      homeTeamTpId: 5,
      awayTeamTpId: 3,
      winner: 'home', // 5 beats 3
    }),
    match({
      id: 4,
      phaseOrder: 2,
      round: 2,
      homeTeamTpId: 1,
      awayTeamTpId: 7,
      winner: 'away', // 7 beats 1
    }),
    // Terminal: order 3, round 1 -- final (5 v 7) and bronze (3 v 1).
    match({
      id: 5,
      phaseOrder: 3,
      round: 1,
      homeTeamTpId: 5,
      awayTeamTpId: 7,
      winner: 'home', // final: 5 beats 7
    }),
    match({
      id: 6,
      phaseOrder: 3,
      round: 1,
      homeTeamTpId: 3,
      awayTeamTpId: 1,
      winner: 'away', // bronze: 1 beats 3
    }),
  ];
}

function classify(
  service: TpMatchCategoryService,
  options: ClassifyTpMatchOptions,
) {
  return service.classify(options);
}

describe('TpMatchCategoryService', () => {
  let service: TpMatchCategoryService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TpMatchCategoryService],
    }).compile();
    service = moduleRef.get(TpMatchCategoryService);
  });

  it('classifies a main-phase (phaseOrder 1) match as normal for a season competition', () => {
    const m = match({ id: 1, phaseOrder: 1 });
    expect(
      classify(service, {
        match: m,
        competitionType: 'season',
        competitionMatches: [m],
      }),
    ).toBe('normal');
  });

  it('classifies a main-phase (phaseOrder 1) match as normal for a cup competition', () => {
    const m = match({ id: 1, phaseOrder: 1 });
    expect(
      classify(service, {
        match: m,
        competitionType: 'cup',
        competitionMatches: [m],
      }),
    ).toBe('normal');
  });

  describe('the 6-match shape (qualifier -> semifinal -> final+bronze)', () => {
    const matches = sixMatchSeason();

    it.each([
      [1, 'season_qualifier'],
      [2, 'season_qualifier'],
      [3, 'season_semi_final'],
      [4, 'season_semi_final'],
      [5, 'season_final'],
      [6, 'season_bronze'],
    ] as const)('classifies match %i as %s', (id, expected) => {
      const m = matches.find((candidate) => candidate.id === id);
      expect(m).toBeDefined();
      expect(
        classify(service, {
          match: m!,
          competitionType: 'season',
          competitionMatches: matches,
        }),
      ).toBe(expected);
    });
  });

  describe('the 6-match shape with the tloegbbl-sasong-28 inverted grouping (qualifier+semifinal share phaseOrder 2, terminal alone at phaseOrder 3)', () => {
    const matches = sixMatchSeasonInvertedGrouping();

    it.each([
      [1, 'season_qualifier'],
      [2, 'season_qualifier'],
      [3, 'season_semi_final'],
      [4, 'season_semi_final'],
      [5, 'season_final'],
      [6, 'season_bronze'],
    ] as const)(
      'classifies match %i as %s (the sasong-28 inversion)',
      (id, expected) => {
        const m = matches.find((candidate) => candidate.id === id);
        expect(m).toBeDefined();
        expect(
          classify(service, {
            match: m!,
            competitionType: 'season',
            competitionMatches: matches,
          }),
        ).toBe(expected);
      },
    );
  });

  describe('the 4-match shape (semifinal -> final+bronze, no qualifier; no local fixture example)', () => {
    const matches = fourMatchSeason();

    it.each([
      [1, 'season_semi_final'],
      [2, 'season_semi_final'],
      [3, 'season_final'],
      [4, 'season_bronze'],
    ] as const)('classifies match %i as %s', (id, expected) => {
      const m = matches.find((candidate) => candidate.id === id);
      expect(m).toBeDefined();
      expect(
        classify(service, {
          match: m!,
          competitionType: 'season',
          competitionMatches: matches,
        }),
      ).toBe(expected);
    });
  });

  it('resolves the final/bronze split by transitive inference when one semifinal is a drawn tie (the sasong-29 case)', () => {
    // Semifinal A is a genuine draw (winner undetermined by score alone).
    // Semifinal B has a clear winner (team 5). Team 1 (from the drawn
    // semifinal) faces confirmed-winner team 5 in the terminal round --
    // since only one terminal match can contain a confirmed winner, that
    // match must be the final, and by transitivity team 1 must have won its
    // drawn semifinal on some tiebreak the score doesn't expose. The other
    // terminal match (3 v 7) is therefore bronze.
    const matches: TpMatch[] = [
      match({
        id: 1,
        phaseOrder: 2,
        round: 1,
        homeTeamTpId: 1,
        awayTeamTpId: 3,
        winner: 'draw',
      }),
      match({
        id: 2,
        phaseOrder: 2,
        round: 1,
        homeTeamTpId: 5,
        awayTeamTpId: 7,
        winner: 'home', // 5 beats 7
      }),
      match({
        id: 3,
        phaseOrder: 3,
        round: 1,
        homeTeamTpId: 1,
        awayTeamTpId: 5,
        winner: 'away', // final: 5 beats 1
      }),
      match({
        id: 4,
        phaseOrder: 3,
        round: 1,
        homeTeamTpId: 3,
        awayTeamTpId: 7,
        winner: 'home', // bronze: 3 beats 7
      }),
    ];

    const finalMatch = matches.find((m) => m.id === 3)!;
    const bronzeMatch = matches.find((m) => m.id === 4)!;

    expect(
      classify(service, {
        match: finalMatch,
        competitionType: 'season',
        competitionMatches: matches,
      }),
    ).toBe('season_final');
    expect(
      classify(service, {
        match: bronzeMatch,
        competitionType: 'season',
        competitionMatches: matches,
      }),
    ).toBe('season_bronze');
  });

  it('throws naming the match id when both semifinal-stage matches are drawn (unresolvable)', () => {
    const matches: TpMatch[] = [
      match({
        id: 1,
        phaseOrder: 2,
        round: 1,
        homeTeamTpId: 1,
        awayTeamTpId: 3,
        winner: 'draw',
      }),
      match({
        id: 2,
        phaseOrder: 2,
        round: 1,
        homeTeamTpId: 5,
        awayTeamTpId: 7,
        winner: 'draw',
      }),
      match({
        id: 3,
        phaseOrder: 3,
        round: 1,
        homeTeamTpId: 1,
        awayTeamTpId: 5,
        winner: 'home',
      }),
      match({
        id: 4,
        phaseOrder: 3,
        round: 1,
        homeTeamTpId: 3,
        awayTeamTpId: 7,
        winner: 'home',
      }),
    ];
    const terminalMatch = matches.find((m) => m.id === 3)!;

    expect(() =>
      classify(service, {
        match: terminalMatch,
        competitionType: 'season',
        competitionMatches: matches,
      }),
    ).toThrow(
      /TP match 3: both semifinal-stage matches feeding it are drawn ties/,
    );
  });

  it('throws when the terminal stage cannot be split into exactly one final and one bronze candidate', () => {
    // A synthetic, structurally-invalid bracket: both semifinal matches have
    // confirmed winners (5 and 7), but BOTH terminal matches happen to
    // contain one of those winners -- a real bracket can never produce this
    // (a team can only play in one terminal match), but the guard must
    // still catch it and throw rather than pick one arbitrarily.
    const matches: TpMatch[] = [
      match({
        id: 1,
        phaseOrder: 2,
        round: 1,
        homeTeamTpId: 5,
        awayTeamTpId: 6,
        winner: 'home', // 5 beats 6
      }),
      match({
        id: 2,
        phaseOrder: 2,
        round: 1,
        homeTeamTpId: 7,
        awayTeamTpId: 8,
        winner: 'home', // 7 beats 8
      }),
      match({
        id: 3,
        phaseOrder: 3,
        round: 1,
        homeTeamTpId: 5,
        awayTeamTpId: 3,
        winner: 'home',
      }),
      match({
        id: 4,
        phaseOrder: 3,
        round: 1,
        homeTeamTpId: 7,
        awayTeamTpId: 1,
        winner: 'home',
      }),
    ];
    const terminalMatch = matches.find((m) => m.id === 3)!;

    expect(() =>
      classify(service, {
        match: terminalMatch,
        competitionType: 'season',
        competitionMatches: matches,
      }),
    ).toThrow(
      /TP match 3: expected exactly one terminal-stage match to contain a confirmed semifinal winner, found 2/,
    );
  });

  it('throws for a season competition whose non-main match count is not 4 or 6', () => {
    const matches: TpMatch[] = [
      match({ id: 1, phaseOrder: 2, round: 1 }),
      match({ id: 2, phaseOrder: 2, round: 1 }),
      match({ id: 3, phaseOrder: 2, round: 1 }),
    ];
    expect(() =>
      classify(service, {
        match: matches[0],
        competitionType: 'season',
        competitionMatches: matches,
      }),
    ).toThrow(/TP match 1: its competition has 3 non-main-phase matches/);
  });

  it('throws when a stage bucket does not contain exactly 2 matches', () => {
    const matches: TpMatch[] = [
      match({ id: 1, phaseOrder: 2, round: 1 }),
      match({ id: 2, phaseOrder: 2, round: 1 }),
      match({ id: 3, phaseOrder: 2, round: 1 }),
      match({ id: 4, phaseOrder: 3, round: 1 }),
    ];
    expect(() =>
      classify(service, {
        match: matches[0],
        competitionType: 'season',
        competitionMatches: matches,
      }),
    ).toThrow(
      /phase order 2 round 1 has 3 matches, but the confirmed mapping expects exactly 2 per stage/,
    );
  });

  it('throws for a cup competition match with a non-main phase (no confirmed cup playoff mapping)', () => {
    const m = match({ id: 9, phaseOrder: 2, round: 1 });
    expect(() =>
      classify(service, {
        match: m,
        competitionType: 'cup',
        competitionMatches: [m],
      }),
    ).toThrow(/9/);
  });

  it('never returns a season_* category for a cup competition', () => {
    const m = match({ id: 1, phaseOrder: 1 });
    const result = classify(service, {
      match: m,
      competitionType: 'cup',
      competitionMatches: [m],
    });
    expect(result).toBe('normal');
    expect(result).not.toMatch(/^season_/);
  });

  it('never returns cup_final for a season competition', () => {
    const m = match({ id: 1, phaseOrder: 1 });
    const result = classify(service, {
      match: m,
      competitionType: 'season',
      competitionMatches: [m],
    });
    expect(result).not.toBe('cup_final');
  });
});
