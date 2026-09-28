import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import JSON5 from 'json5';
import { beforeEach, describe, expect, it } from 'vitest';

import type {
  CompetitionGroupMatch,
  NamePatternCandidate,
} from './tp-competition-group-matcher.service';
import { TpCompetitionGroupMatcherService } from './tp-competition-group-matcher.service';

/**
 * Verifies the curated regular expressions themselves -- regexes are hard to
 * judge correct by inspection -- by running the real matcher over the real
 * curated file against every raw name each recurring track has actually
 * carried in the source dumps.
 */
const CURATED_GROUPS_FILE = join(
  __dirname,
  '../../../../tools/import-manual/data/before-other-importers/competition-groups.json5',
);

interface CuratedGroup {
  name: string;
  namePattern?: string;
}

function curatedGroups(): CuratedGroup[] {
  return JSON5.parse<{ competitionGroups: CuratedGroup[] }>(
    readFileSync(CURATED_GROUPS_FILE, 'utf8'),
  ).competitionGroups;
}

function curatedCandidates(): NamePatternCandidate[] {
  return curatedGroups().map((group, index) => {
    if (group.namePattern === undefined) {
      throw new Error(`Curated group "${group.name}" has no namePattern`);
    }
    return { id: index + 1, name: group.name, namePattern: group.namePattern };
  });
}

/**
 * Every raw name each recurring group's instances carried in BBL's
 * competition list (tools/import-bbl/data/tloeg.bbleague.se/default.asp?p=se)
 * and TP's tournament_<slug>.json files (tools/import-tp/data/), plus the
 * canonical and TP-styled names a next instance would plausibly get --
 * including the spelled-out "tLoEG Blood Bowl League" prefix TP uses
 * alongside "tLoEGBBL". Each name must match its own group alone, which is
 * what keeps a Minor Season name out of Major Season (and vice versa) and
 * "tLoEGBBL - Dungeon Bowl Season N" out of both season tracks.
 */
const HISTORICAL_NAMES: Record<string, string[]> = {
  'Major Season': [
    ...Array.from({ length: 18 }, (_, index) => `Season ${index + 1}`),
    'Major Season 19',
    'Major Season 20',
    'Major Season 21',
    'Major Season 22',
    'Major Season 23',
    'Major Season 24',
    'tLoEGBBL Major Season 25',
    'tLoEGBBL Säsong 26',
    'tLoEGBBL Säsong 27',
    'tLoEGBBL Säsong 28',
    'tLoEGBBL Säsong 29',
    'tLoEGBBL Säsong 30',
    'tLoEGBBL Säsong 31',
    'Major Season 31',
    'tLoEG Blood Bowl League Säsong 31',
    'tLoEG Blood Bowl League Major Season 32',
    'tLoEG Blood Bowl League - Major Season 32',
    'tLoEG Blood Bowl League Season 32',
    'tLoEGBBL - Season 32',
  ],
  'Minor Season': [
    'Korpen 1',
    'Korpen 9',
    'Minor Season 18',
    'Minor Season 19',
    'Minor Season 21',
    'Minor Season 22',
    'Minor Season 23',
    'Minor Season 25',
    'tLoEGBBL Minor Season 25',
    'tLoEG Blood Bowl League Minor Season 26',
    'tLoEG - Korpen 10',
  ],
  'Chaos Cup': [
    'Chaos Cup',
    'Chaos Cup 2',
    'Chaos Cup 7',
    'tLoEGBBL Chaos Cup 8',
    'tLoEGBBL Chaos Cup 9',
    'tLoEG Blood Bowl League Chaos Cup 9',
    'tLoEG Blood Bowl League - Chaos Cup 10',
    'tLoEG Blood Bowl League Chaos Cup',
  ],
  'Stunty Leeg': [
    'Stunty Leeg 1',
    'Stunty Leeg 2',
    'tLoEG Blood Bowl League Stunty Leeg 3',
    'tLoEG Blood Bowl League - Stunty Leeg 3',
  ],
  'Fright Night': [
    'Fright Night',
    'Fright Night 2',
    'tLoEGBBL Fright Night 2',
    'tLoEG Blood Bowl League Fright Night 3',
    'tLoEG Blood Bowl League - Fright Night',
  ],
  Snöbollskrieg: [
    'Snöbollskrieg',
    'Snöbollskrieg 2',
    'tLoEGBBL - Snöbollskrieg 2026',
    'tLoEG Blood Bowl League - Snöbollskrieg 2027',
    'tLoEG Blood Bowl League Snöbollskrieg',
  ],
  'Moot Mania': [
    'Moot Mania',
    'Moot Mania 2',
    'Moot Mania 3',
    'Moot Mania 4',
    'tLoEG Blood Bowl League Moot Mania 5',
    'tLoEG Blood Bowl League - Moot Mania 5',
  ],
  // BBL's only instance is "Champions of tLoEG" (plural) -- the group's own
  // name is singular -- so both spellings are accepted.
  'Champion of tLoEG': [
    'Champions of tLoEG',
    'Champion of tLoEG',
    'Champions of tLoEG 2',
    'tLoEGBBL Champions of tLoEG 2',
    'tLoEG Blood Bowl League Champions of tLoEG 2',
    'tLoEG Blood Bowl League - Champion of tLoEG 3',
  ],
  NAA: [
    'NAA',
    'NAA 2',
    'tLoEG Blood Bowl League NAA 3',
    'tLoEG Blood Bowl League - NAA',
  ],
  'Blitzmania!': [
    'Blitzmania!',
    'Blitzmania! 2',
    'tLoEGBBL Blitzmania! 2',
    'Blitzmania 2',
    'tLoEG Blood Bowl League Blitzmania! 3',
    'tLoEG Blood Bowl League - Blitzmania 3',
  ],
  Ogretoberfest: [
    'Ogretoberfest',
    'Ogretoberfest 2',
    'Ogretoberfest 9',
    'Ogretoberfest10',
    'Ogretoberfest 11',
    '-OGRETOBERFEST 12 -',
    'Ogretoberfest 13',
    'Ogretoberfest 14',
    'tLoEG Blood Bowl League Ogretoberfest 15',
    'tLoEG Blood Bowl League - Ogretoberfest 15',
  ],
  'Dungeon Bowl': [
    'Dungeon Bowl 1',
    'tLoEGBBL - Dungeon Bowl Season 2',
    'tLoEGBBL - Dungeon Bowl Season 3',
    'tLoEGBBL - Dungeon Bowl Season 4',
    'tLoEGBBL - Dungeon Bowl Season 5',
    'tLoEG Blood Bowl League - Dungeon Bowl Season 6',
    'tLoEG Blood Bowl League Dungeon Bowl Season 6',
  ],
  'Reserves Rumble': [
    'Reserves Rumble',
    'Reserves Rumble 4',
    'tLoEG Blood Bowl League Reserves Rumble 5',
    'tLoEG Blood Bowl League - Reserves Rumble',
  ],
  GBBL: ['GBBL 1', 'GBBL 2'],
};

/**
 * Names no group should claim. "Champions of..." is how BBL's competition
 * list truncates "Champions of tLoEG"; with no "tLoEG" to anchor on it must
 * stay unmatched rather than be guessed into Champion of tLoEG.
 */
const NEVER_MATCHED = [
  'Champions of...',
  'Fright Nightmare',
  'Blitzmania!!',
  'tLoEGBBL Open 2026',
  'tLoEGBBL Säsong',
  'Chaos Cupcake',
  'GBBL Chaos Cup 3',
  'tLoEG Blood Bowl Chaos Cup 9',
  'tLoEG Blood Bowl League Open 2026',
];

describe('curated competition group name patterns', () => {
  let matcher: TpCompetitionGroupMatcherService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TpCompetitionGroupMatcherService],
    }).compile();
    matcher = moduleRef.get(TpCompetitionGroupMatcherService);
  });

  it('gives every curated group a pattern, with historical names pinned for each', () => {
    const groups = curatedGroups();
    expect(
      groups
        .filter((group) => group.namePattern === undefined)
        .map((group) => group.name),
    ).toEqual([]);
    expect(groups.map((group) => group.name).sort()).toEqual(
      Object.keys(HISTORICAL_NAMES).sort(),
    );
  });

  describe.each(Object.entries(HISTORICAL_NAMES))(
    '%s',
    (groupName: string, names: string[]) => {
      it.each(names)('matches "%s" to this group alone', (name) => {
        const expected: CompetitionGroupMatch = {
          kind: 'matched',
          group: expect.objectContaining({
            name: groupName,
          }) as NamePatternCandidate,
        };
        expect(matcher.match(name, curatedCandidates())).toEqual(expected);
      });
    },
  );

  it.each(NEVER_MATCHED)('matches "%s" to no group', (name) => {
    expect(matcher.match(name, curatedCandidates())).toEqual({
      kind: 'unmatched',
    });
  });
});
