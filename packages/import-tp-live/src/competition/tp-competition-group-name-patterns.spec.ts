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
 * canonical and TP-styled names a next instance would plausibly get.
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
  ],
  'Chaos Cup': [
    'Chaos Cup',
    'Chaos Cup 2',
    'Chaos Cup 7',
    'tLoEGBBL Chaos Cup 8',
    'tLoEGBBL Chaos Cup 9',
  ],
  'Stunty Leeg': ['Stunty Leeg 1', 'Stunty Leeg 2'],
  'Fright Night': ['Fright Night', 'Fright Night 2', 'tLoEGBBL Fright Night 2'],
  Snöbollskrieg: [
    'Snöbollskrieg',
    'Snöbollskrieg 2',
    'tLoEGBBL - Snöbollskrieg 2026',
  ],
  'Moot Mania': ['Moot Mania', 'Moot Mania 2', 'Moot Mania 3', 'Moot Mania 4'],
  // BBL's only instance is "Champions of tLoEG" (plural) -- the group's own
  // name is singular -- so both spellings are accepted.
  'Champion of tLoEG': [
    'Champions of tLoEG',
    'Champion of tLoEG',
    'Champions of tLoEG 2',
    'tLoEGBBL Champions of tLoEG 2',
  ],
  NAA: ['NAA', 'NAA 2'],
  'Blitzmania!': [
    'Blitzmania!',
    'Blitzmania! 2',
    'tLoEGBBL Blitzmania! 2',
    'Blitzmania 2',
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
  ],
  'Dungeon Bowl': [
    'Dungeon Bowl 1',
    'tLoEGBBL - Dungeon Bowl Season 2',
    'tLoEGBBL - Dungeon Bowl Season 3',
    'tLoEGBBL - Dungeon Bowl Season 4',
    'tLoEGBBL - Dungeon Bowl Season 5',
  ],
  'Reserves Rumble': ['Reserves Rumble', 'Reserves Rumble 4'],
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
