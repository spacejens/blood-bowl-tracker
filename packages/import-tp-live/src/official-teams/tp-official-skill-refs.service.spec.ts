import type { ExternalId, ImportError } from '@blood-bowl-tracker/api-contract';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpImportResultsService } from '../tp-import-results.service';
import { TpSkillIdLookupService } from '../tp-skill-id-lookup.service';
import { TpKeywordTargetDecoderService } from './tp-keyword-target-decoder.service';
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

const BLOCK_TP_IDS: ExternalId[] = [
  { externalSystemId: TP_SYSTEM_ID, externalId: '41' },
  { externalSystemId: TP_SYSTEM_ID, externalId: '1041' },
];
const LONER_TP_IDS: ExternalId[] = [
  { externalSystemId: TP_SYSTEM_ID, externalId: '60' },
];
const HATRED_TP_IDS: ExternalId[] = [
  { externalSystemId: TP_SYSTEM_ID, externalId: '307' },
];

describe('TpOfficialSkillRefsService', () => {
  let service: TpOfficialSkillRefsService;
  let lookup: MockProxy<TpSkillIdLookupService>;
  let errors: ImportError[];

  beforeEach(async () => {
    lookup = mock<TpSkillIdLookupService>();
    lookup.tpIdsByName.mockReturnValue(new Map());
    lookup.tpExternalIds.mockReturnValue([]);
    lookup.resolveByTpId.mockResolvedValue(new Map());
    errors = [];
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpOfficialSkillRefsService,
        TpImportResultsService,
        // Pure, dependency-free decision logic, passed real so the type-3
        // tests keep exercising the actual decode.
        TpKeywordTargetDecoderService,
        { provide: TpSkillIdLookupService, useValue: lookup },
      ],
    }).compile();
    service = moduleRef.get(TpOfficialSkillRefsService);
  });

  it('names a supplied skill master, carrying every TP id seen for that name and its attribute value', async () => {
    lookup.tpIdsByName.mockReturnValue(
      new Map([
        ['Block', new Set([41, 1041])],
        ['Loner', new Set([60])],
      ]),
    );
    lookup.tpExternalIds
      .mockReturnValueOnce(BLOCK_TP_IDS)
      .mockReturnValueOnce(LONER_TP_IDS);
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
              externalIds: BLOCK_TP_IDS,
            },
            {
              name: 'Loner',
              isElite: false,
              externalIds: LONER_TP_IDS,
              attributeValue: '4+',
            },
          ],
        ],
      ]),
    );
    expect(lookup.tpIdsByName).toHaveBeenCalledWith([
      [41, { skillMasterId: 41, name: 'Block', isElite: true }],
      [1041, { skillMasterId: 1041, name: 'Block', isElite: true }],
      [60, { skillMasterId: 60, name: 'Loner', isElite: false }],
    ]);
    expect(lookup.tpExternalIds).toHaveBeenCalledWith(
      new Set([41, 1041]),
      TP_SYSTEM_ID,
    );
    expect(lookup.tpExternalIds).toHaveBeenCalledWith(
      new Set([60]),
      TP_SYSTEM_ID,
    );
    expect(lookup.resolveByTpId).toHaveBeenCalledWith({
      masterIds: [],
      tpSystemId: TP_SYSTEM_ID,
      errors,
    });
    expect(errors).toEqual([]);
  });

  it('resolves an unnamed id through the skill registered under that TP id, in one batch', async () => {
    lookup.resolveByTpId.mockResolvedValue(
      new Map([
        [41, 500],
        [42, 501],
      ]),
    );

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

    expect(lookup.resolveByTpId).toHaveBeenCalledTimes(1);
    expect(lookup.resolveByTpId).toHaveBeenCalledWith({
      masterIds: [41, 42],
      tpSystemId: TP_SYSTEM_ID,
      errors,
    });
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
          'Could not resolve TP skill 99 (first seen on position "Blitzer", rules set "BB2020"): no name was supplied for it and no skill carries it as a TP external id, so it is left out of that position\'s starting skills. Import a roster or match that names it, or curate it in tools/import-manual (skills.json5 in a new batch under data/batches/).',
      },
    ]);
  });

  it('decodes a Hatred type-3 target through the keyword catalogue', async () => {
    lookup.tpIdsByName.mockReturnValue(new Map([['Hatred', new Set([307])]]));
    lookup.tpExternalIds.mockReturnValue(HATRED_TP_IDS);
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
        externalIds: HATRED_TP_IDS,
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
          'TP skill 307 (Hatred) on position "Blitzer" names keyword code "999" as its target, and no curated keyword carries that code, so it is left out of that position\'s starting skills. Curate it in tools/import-manual (keywords.json5 in a new batch under data/batches/).',
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

  it('treats a failed id lookup (already reported by it) as no registered ids and reports each unresolved id', async () => {
    lookup.resolveByTpId.mockResolvedValue(undefined);

    const refs = await service.resolve({
      slots: [positionSlot({ skills: [{ skillMasterId: 41 }] })],
      skillMasters: [],
      catalog: CATALOG,
      context: officialTeamsContext(),
      errors,
    });

    expect(refs.size).toBe(0);
    expect(errors.map((error) => error.message)).toEqual([
      expect.stringContaining('Could not resolve TP skill 41'),
    ]);
  });

  it('registers no TP id for a supplied name the inversion does not list', async () => {
    await service.resolve({
      slots: [positionSlot({ skills: [{ skillMasterId: 41 }] })],
      skillMasters: [{ skillMasterId: 41, name: 'Block', isElite: false }],
      catalog: CATALOG,
      context: officialTeamsContext(),
      errors,
    });

    expect(lookup.tpExternalIds).toHaveBeenCalledWith([], TP_SYSTEM_ID);
  });
});
