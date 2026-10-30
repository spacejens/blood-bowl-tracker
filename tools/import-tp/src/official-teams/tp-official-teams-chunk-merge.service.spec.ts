import type {
  ImportResult,
  TpOfficialTeamsImportResult,
} from '@blood-bowl-tracker/api-contract';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { STATS } from './official-teams.test-helpers';
import { TpOfficialTeamsChunkMergeService } from './tp-official-teams-chunk-merge.service';

const ONE: ImportResult = { success: true, imported: 1, errors: [] };

function outcome(
  overrides: Partial<TpOfficialTeamsImportResult> = {},
): TpOfficialTeamsImportResult {
  return {
    races: ONE,
    positions: ONE,
    characteristics: ONE,
    keywords: ONE,
    startingSkills: ONE,
    skillCategories: ONE,
    positionCharacteristics: [],
    ...overrides,
  };
}

function withErrors(
  ...errors: { item: unknown; message: string }[]
): ImportResult {
  return { success: false, imported: 1, errors };
}

describe('TpOfficialTeamsChunkMergeService', () => {
  let service: TpOfficialTeamsChunkMergeService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TpOfficialTeamsChunkMergeService],
    }).compile();
    service = moduleRef.get(TpOfficialTeamsChunkMergeService);
  });

  it('sums each stage across chunks and rules sets', () => {
    const { tallies } = service.merge({
      outcomes: [
        { rulesSet: 'BB2020', outcome: outcome() },
        { rulesSet: 'BB2020', outcome: outcome() },
        {
          rulesSet: 'BB2025',
          outcome: outcome({ keywords: { ...ONE, imported: 5 } }),
        },
      ],
      failureErrors: [],
    });

    expect(tallies.races).toEqual({ imported: 3, errors: [] });
    expect(tallies.keywords).toEqual({ imported: 7, errors: [] });
    expect(tallies.skillCategories).toEqual({ imported: 3, errors: [] });
  });

  it('records failed requests first under races, never de-duplicated', () => {
    const failure = { item: { rulesSet: 'BB2020' }, message: 'boom' };
    const raceError = { item: { race: 'Orc' }, message: 'race failed' };

    const { tallies } = service.merge({
      outcomes: [
        {
          rulesSet: 'BB2020',
          outcome: outcome({ races: withErrors(raceError) }),
        },
      ],
      failureErrors: [failure, failure],
    });

    expect(tallies.races.errors).toEqual([failure, failure, raceError]);
  });

  it('records failures even when no request succeeded', () => {
    const failure = { item: { rulesSet: 'BB2020' }, message: 'boom' };

    const { tallies } = service.merge({
      outcomes: [],
      failureErrors: [failure],
    });

    expect(tallies.races).toEqual({ imported: 0, errors: [failure] });
  });

  it('keeps an error repeated exactly by several chunks of one rules set once', () => {
    const noEra = { item: { rulesSet: 'BB2020' }, message: 'no era' };

    const { tallies } = service.merge({
      outcomes: [
        { rulesSet: 'BB2020', outcome: outcome({ races: withErrors(noEra) }) },
        { rulesSet: 'BB2020', outcome: outcome({ races: withErrors(noEra) }) },
      ],
      failureErrors: [],
    });

    expect(tallies.races.errors).toEqual([noEra]);
  });

  it('keeps the first report of a gap the server reports once per request', () => {
    const keywordFirst = {
      item: { position: 9, keywordCode: 4 },
      message: 'TP keyword code 4 (first seen on position "Blitzer")',
    };
    const keywordAgain = {
      item: { position: 12, keywordCode: 4 },
      message: 'TP keyword code 4 (first seen on position "Thrower")',
    };
    const skillFirst = {
      item: { position: 9, skillMasterId: 41 },
      message: 'Could not resolve TP skill 41 (first seen on "Blitzer")',
    };
    const skillAgain = {
      item: { position: 12, skillMasterId: 41 },
      message: 'Could not resolve TP skill 41 (first seen on "Thrower")',
    };
    const targetFirst = {
      item: { position: 9, skillMasterId: 307, attributeValue: '111' },
      message: 'TP skill 307 on position "Blitzer" names keyword code "111"',
    };
    const targetAgain = {
      item: { position: 12, skillMasterId: 307, attributeValue: '111' },
      message: 'TP skill 307 on position "Thrower" names keyword code "111"',
    };

    const { tallies } = service.merge({
      outcomes: [
        {
          rulesSet: 'BB2020',
          outcome: outcome({
            keywords: withErrors(keywordFirst),
            startingSkills: withErrors(skillFirst, targetFirst),
          }),
        },
        {
          rulesSet: 'BB2020',
          outcome: outcome({
            keywords: withErrors(keywordAgain),
            startingSkills: withErrors(skillAgain, targetAgain),
          }),
        },
      ],
      failureErrors: [],
    });

    expect(tallies.keywords.errors).toEqual([keywordFirst]);
    expect(tallies.startingSkills.errors).toEqual([skillFirst, targetFirst]);
  });

  it('keeps the same gap once per rules set', () => {
    const gap = { item: { position: 9, keywordCode: 4 }, message: 'gap' };

    const { tallies } = service.merge({
      outcomes: [
        { rulesSet: 'BB2020', outcome: outcome({ keywords: withErrors(gap) }) },
        { rulesSet: 'BB2025', outcome: outcome({ keywords: withErrors(gap) }) },
      ],
      failureErrors: [],
    });

    expect(tallies.keywords.errors).toEqual([gap, gap]);
  });

  it('keeps distinct per-position errors, including positions named by name', () => {
    const blitzer = {
      item: { position: 'Blitzer', race: 'Orc', rulesSet: 'BB2020' },
      message: 'Failed to upsert position "Blitzer"',
    };
    const thrower = {
      item: { position: 'Thrower', race: 'Orc', rulesSet: 'BB2020' },
      message: 'Failed to upsert position "Thrower"',
    };
    const writeNine = {
      item: { positionId: 9, rulesSet: 'BB2020' },
      message: 'Failed to write the keywords of position "Blitzer"',
    };
    const writeTwelve = {
      item: { positionId: 12, rulesSet: 'BB2020' },
      message: 'Failed to write the keywords of position "Thrower"',
    };
    const nullItem = { item: null, message: 'odd' };

    const { tallies } = service.merge({
      outcomes: [
        {
          rulesSet: 'BB2020',
          outcome: outcome({
            positions: withErrors(blitzer),
            keywords: withErrors(writeNine, nullItem),
          }),
        },
        {
          rulesSet: 'BB2020',
          outcome: outcome({
            positions: withErrors(thrower),
            keywords: withErrors(writeTwelve),
          }),
        },
      ],
      failureErrors: [],
    });

    expect(tallies.positions.errors).toEqual([blitzer, thrower]);
    expect(tallies.keywords.errors).toEqual([writeNine, nullItem, writeTwelve]);
  });

  it("collects every position's characteristics by position and rules set id", () => {
    const strong = { ...STATS, strength: 5 };

    const { characteristicsByPositionId } = service.merge({
      outcomes: [
        {
          rulesSet: 'BB2020',
          outcome: outcome({
            positionCharacteristics: [
              { positionId: 9, rulesSetId: 20, ...STATS },
            ],
          }),
        },
        {
          rulesSet: 'BB2020',
          outcome: outcome({
            positionCharacteristics: [
              { positionId: 9, rulesSetId: 20, ...STATS },
              { positionId: 10, rulesSetId: 20, ...strong },
            ],
          }),
        },
        {
          rulesSet: 'BB2025',
          outcome: outcome({
            positionCharacteristics: [
              { positionId: 9, rulesSetId: 25, ...strong },
            ],
          }),
        },
      ],
      failureErrors: [],
    });

    expect(characteristicsByPositionId).toEqual(
      new Map([
        [
          9,
          new Map([
            [20, STATS],
            [25, strong],
          ]),
        ],
        [10, new Map([[20, strong]])],
      ]),
    );
  });

  it('merges nothing into empty tallies', () => {
    const merged = service.merge({ outcomes: [], failureErrors: [] });

    expect(merged.tallies.races).toEqual({ imported: 0, errors: [] });
    expect(merged.characteristicsByPositionId.size).toBe(0);
  });
});
