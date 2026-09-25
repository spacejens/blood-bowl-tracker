import type { ImportError } from '@blood-bowl-tracker/api-contract';
import { SkillsService } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpImportResultsService } from '../tp-import-results.service';
import { TpUpsertRunnerService } from '../tp-upsert-runner.service';
import type { TpOfficialKeywordCatalog } from './tp-official-keyword-catalog.service';
import { TpOfficialSkillRefsService } from './tp-official-skill-refs.service';
import {
  officialTeamsContext,
  positionSlot,
  TP_SYSTEM_ID,
} from './tp-official-teams.test-helpers';

const CATALOG: TpOfficialKeywordCatalog = {
  byCode: new Map([[111, { keywordId: 5, name: 'Dwarf' }]]),
};

describe('TpOfficialSkillRefsService', () => {
  let service: TpOfficialSkillRefsService;
  let skills: MockProxy<SkillsService>;
  let errors: ImportError[];

  beforeEach(async () => {
    skills = mock<SkillsService>();
    skills.resolveBatch.mockImplementation((refs) =>
      Promise.resolve(refs.map(() => ({ found: false as const }))),
    );
    errors = [];
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpOfficialSkillRefsService,
        TpImportResultsService,
        TpUpsertRunnerService,
        { provide: SkillsService, useValue: skills },
      ],
    }).compile();
    service = moduleRef.get(TpOfficialSkillRefsService);
  });

  it('names a supplied skill master, carrying every TP id seen for that name and its attribute value', async () => {
    const refs = await service.resolve({
      slots: [
        positionSlot({
          skills: [
            { skillMasterId: 41 },
            { skillMasterId: 60, attributeValue: '4+' },
          ],
        }),
      ],
      skillMasters: [
        { skillMasterId: 41, name: 'Block', isElite: true },
        { skillMasterId: 1041, name: 'Block', isElite: true },
        { skillMasterId: 60, name: 'Loner', isElite: false },
      ],
      catalog: CATALOG,
      context: officialTeamsContext(),
      errors,
    });

    expect(refs).toEqual(
      new Map([
        [
          9,
          [
            {
              name: 'Block',
              isElite: true,
              externalIds: [
                { externalSystemId: TP_SYSTEM_ID, externalId: '41' },
                { externalSystemId: TP_SYSTEM_ID, externalId: '1041' },
              ],
            },
            {
              name: 'Loner',
              isElite: false,
              externalIds: [
                { externalSystemId: TP_SYSTEM_ID, externalId: '60' },
              ],
              attributeValue: '4+',
            },
          ],
        ],
      ]),
    );
    expect(skills.resolveBatch).not.toHaveBeenCalled();
    expect(errors).toEqual([]);
  });

  it('resolves an unnamed id through the skill registered under that TP id, in one batch', async () => {
    skills.resolveBatch.mockResolvedValue([
      { found: true, id: 500 },
      { found: true, id: 501 },
    ]);

    const refs = await service.resolve({
      slots: [
        positionSlot({ skills: [{ skillMasterId: 41 }] }),
        positionSlot({
          positionId: 12,
          skills: [{ skillMasterId: 42 }, { skillMasterId: 41 }],
        }),
      ],
      skillMasters: [],
      catalog: CATALOG,
      context: officialTeamsContext(),
      errors,
    });

    expect(skills.resolveBatch).toHaveBeenCalledTimes(1);
    expect(skills.resolveBatch).toHaveBeenCalledWith([
      { externalSystemId: TP_SYSTEM_ID, externalId: '41' },
      { externalSystemId: TP_SYSTEM_ID, externalId: '42' },
    ]);
    expect(refs.get(9)).toEqual([{ name: 'TP skill 41', skillId: 500 }]);
    expect(refs.get(12)).toEqual([
      { name: 'TP skill 42', skillId: 501 },
      { name: 'TP skill 41', skillId: 500 },
    ]);
    expect(errors).toEqual([]);
  });

  it("passes a star's named special rule straight through", async () => {
    const refs = await service.resolve({
      slots: [positionSlot({ skills: [{ name: 'Brutal Charge' }] })],
      skillMasters: [],
      catalog: CATALOG,
      context: officialTeamsContext(),
      errors,
    });

    expect(refs.get(9)).toEqual([{ name: 'Brutal Charge' }]);
  });

  it('reports an unresolvable id once across positions and keeps their other skills', async () => {
    const refs = await service.resolve({
      slots: [
        positionSlot({
          skills: [{ skillMasterId: 99 }, { name: 'Brutal Charge' }],
        }),
        positionSlot({
          positionId: 12,
          name: 'Thrower',
          skills: [{ skillMasterId: 99 }],
        }),
      ],
      skillMasters: [],
      catalog: CATALOG,
      context: officialTeamsContext(),
      errors,
    });

    expect(refs).toEqual(new Map([[9, [{ name: 'Brutal Charge' }]]]));
    expect(errors).toEqual([
      {
        item: { position: 9, skillMasterId: 99 },
        message:
          'Could not resolve TP skill 99 (first seen on position "Blitzer", rules set "BB2020"): no name was supplied for it and no skill carries it as a TP external id, so it is left out of that position\'s starting skills. Import a roster or match that names it, or curate it in tools/import-manual (data/before-other-importers/skills.json5).',
      },
    ]);
  });

  it('decodes a Hatred type-3 target through the keyword catalogue', async () => {
    const refs = await service.resolve({
      slots: [
        positionSlot({
          skills: [
            { skillMasterId: 307, attributeValue: '111', attributeType: 3 },
          ],
        }),
      ],
      skillMasters: [{ skillMasterId: 307, name: 'Hatred', isElite: false }],
      catalog: CATALOG,
      context: officialTeamsContext(),
      errors,
    });

    expect(refs.get(9)).toEqual([
      {
        name: 'Hatred',
        isElite: false,
        externalIds: [{ externalSystemId: TP_SYSTEM_ID, externalId: '307' }],
        attributeValue: 'Dwarf',
      },
    ]);
  });

  it('reports an undecodable type-3 target once per (skill, code) and leaves the skill out', async () => {
    const hatred999 = {
      skillMasterId: 307,
      attributeValue: '999',
      attributeType: 3,
    };
    const refs = await service.resolve({
      slots: [
        positionSlot({ skills: [hatred999] }),
        positionSlot({ positionId: 12, skills: [hatred999] }),
      ],
      skillMasters: [{ skillMasterId: 307, name: 'Hatred', isElite: false }],
      catalog: CATALOG,
      context: officialTeamsContext(),
      errors,
    });

    expect(refs.size).toBe(0);
    expect(errors).toEqual([
      {
        item: { position: 9, skillMasterId: 307, attributeValue: '999' },
        message:
          'TP skill 307 (Hatred) on position "Blitzer" names keyword code "999" as its target, and no curated keyword carries that code, so it is left out of that position\'s starting skills. Curate it in tools/import-manual (data/before-other-importers/keywords.json5).',
      },
    ]);
  });

  it('never decodes a type-3 value on a skill other than Hatred or Animosity', async () => {
    const refs = await service.resolve({
      slots: [
        positionSlot({
          skills: [
            { skillMasterId: 41, attributeValue: '111', attributeType: 3 },
          ],
        }),
      ],
      skillMasters: [{ skillMasterId: 41, name: 'Block', isElite: false }],
      catalog: CATALOG,
      context: officialTeamsContext(),
      errors,
    });

    expect(refs.size).toBe(0);
    expect(errors).toHaveLength(1);
  });

  it('records a failed id lookup and reports the ids it could not resolve', async () => {
    skills.resolveBatch.mockRejectedValue(new Error('boom'));

    const refs = await service.resolve({
      slots: [positionSlot({ skills: [{ skillMasterId: 41 }] })],
      skillMasters: [],
      catalog: CATALOG,
      context: officialTeamsContext(),
      errors,
    });

    expect(refs.size).toBe(0);
    expect(errors.map((error) => error.message)).toEqual([
      'Failed to resolve TP skill ids by external id: boom',
      expect.stringContaining('Could not resolve TP skill 41'),
    ]);
  });
});
