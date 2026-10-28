import { describe, expect, it } from 'vitest';

import { BATCH_001, BATCH_004, readBatch } from './curated-data.test-helpers';

const BBL = 'tloeg.bbleague.se';
const TP = 'tourplay.net';

/**
 * Every Gudarnas Förkämpe award and the free mutation it granted, as
 * established from the downloaded BBL/TP data. `skill` is undefined where
 * the data does not settle which mutation was free, or none was chosen.
 */
const EXPECTED: {
  competition: { system: string; id: string };
  player: { system: string; id: string };
  skill: string | undefined;
}[] = [
  {
    competition: { system: BBL, id: '14' },
    player: { system: BBL, id: '319' },
    skill: 'Tentacles',
  },
  {
    competition: { system: BBL, id: '21' },
    player: { system: BBL, id: '127' },
    skill: 'Disturbing Presence',
  },
  {
    competition: { system: BBL, id: '27' },
    player: { system: BBL, id: '554' },
    skill: 'Foul Appearance',
  },
  {
    competition: { system: BBL, id: '34' },
    player: { system: BBL, id: '962' },
    skill: 'Horns',
  },
  {
    competition: { system: BBL, id: '41' },
    player: { system: BBL, id: '1236' },
    skill: 'Very Long Legs',
  },
  {
    competition: { system: BBL, id: '51' },
    player: { system: BBL, id: '3078' },
    skill: 'Tentacles',
  },
  {
    competition: { system: BBL, id: '56' },
    player: { system: BBL, id: '374' },
    skill: 'Tentacles',
  },
  {
    competition: { system: TP, id: '18616' },
    player: { system: TP, id: '2464143' },
    skill: 'Tentacles',
  },
];

describe('curated batch 004 trophy awards', () => {
  const awards = readBatch(BATCH_004).trophyAwards;

  it('covers exactly the eight Gudarnas Förkämpe awards', () => {
    expect(awards).toHaveLength(8);
    expect(awards.every((a) => a.trophy === 'Gudarnas Förkämpe')).toBe(true);
    expect(
      awards.map((a) => ({ competition: a.competition, player: a.player })),
    ).toEqual(
      EXPECTED.map((e) => ({ competition: e.competition, player: e.player })),
    );
  });

  it('names each granted skill as pinned', () => {
    expect(awards.map((a) => a.grantedSkill?.id)).toEqual(
      EXPECTED.map((e) => e.skill),
    );
  });

  it('only grants skills curated in the mutation category, by Name id', () => {
    const mutations = new Set(
      readBatch(BATCH_001)
        .skillRulesSets.filter((row) => row.category === 'mutation')
        .map((row) => row.skill.id),
    );
    for (const award of awards) {
      if (award.grantedSkill !== undefined) {
        expect(award.grantedSkill.system).toBe('Name');
        expect(mutations).toContain(award.grantedSkill.id);
      }
    }
  });
});
