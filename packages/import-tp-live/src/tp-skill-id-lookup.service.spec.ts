import type { ImportError } from '@blood-bowl-tracker/api-contract';
import { SkillsService } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpSkillIdLookupService } from './tp-skill-id-lookup.service';
import { TpUpsertRunnerService } from './tp-upsert-runner.service';

const TP_SYSTEM_ID = 1;

describe('TpSkillIdLookupService', () => {
  let service: TpSkillIdLookupService;
  let skills: MockProxy<SkillsService>;
  let errors: ImportError[];

  beforeEach(async () => {
    skills = mock<SkillsService>();
    errors = [];
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpSkillIdLookupService,
        { provide: SkillsService, useValue: skills },
        // Constructor-free exception classification, passed real so the
        // tests assert on the actual recorded error.
        TpUpsertRunnerService,
      ],
    }).compile();
    service = moduleRef.get(TpSkillIdLookupService);
  });

  describe('tpIdsByName', () => {
    it('groups every TP id under its skill name, in first-seen order', () => {
      const byName = service.tpIdsByName([
        [41, { name: 'Block' }],
        [60, { name: 'Loner' }],
        [1041, { name: 'Block' }],
      ]);

      expect(byName).toEqual(
        new Map([
          ['Block', new Set([41, 1041])],
          ['Loner', new Set([60])],
        ]),
      );
      expect([...byName.keys()]).toEqual(['Block', 'Loner']);
      expect([...(byName.get('Block') ?? [])]).toEqual([41, 1041]);
    });

    it('lists a repeated id once', () => {
      const byName = service.tpIdsByName([
        [41, { name: 'Block' }],
        [41, { name: 'Block' }],
      ]);

      expect([...(byName.get('Block') ?? [])]).toEqual([41]);
    });

    it('is empty for no masters', () => {
      expect(service.tpIdsByName([])).toEqual(new Map());
    });
  });

  describe('tpExternalIds', () => {
    it("lists each id as a TP external id, stringified, in the ids' order", () => {
      expect(service.tpExternalIds(new Set([41, 1041]), TP_SYSTEM_ID)).toEqual([
        { externalSystemId: TP_SYSTEM_ID, externalId: '41' },
        { externalSystemId: TP_SYSTEM_ID, externalId: '1041' },
      ]);
    });

    it('is empty for no ids', () => {
      expect(service.tpExternalIds([], TP_SYSTEM_ID)).toEqual([]);
    });
  });

  describe('resolveByTpId', () => {
    it('looks nothing up for no ids', async () => {
      await expect(
        service.resolveByTpId({
          masterIds: [],
          tpSystemId: TP_SYSTEM_ID,
          errors,
        }),
      ).resolves.toEqual(new Map());

      expect(skills.resolveBatch).not.toHaveBeenCalled();
      expect(errors).toEqual([]);
    });

    it('resolves every id in one batch and keeps only the found ones', async () => {
      skills.resolveBatch.mockResolvedValue([
        { found: true, id: 500 },
        { found: false },
      ]);

      const resolved = await service.resolveByTpId({
        masterIds: [41, 42],
        tpSystemId: TP_SYSTEM_ID,
        errors,
      });

      expect(resolved).toEqual(new Map([[41, 500]]));
      expect(skills.resolveBatch).toHaveBeenCalledTimes(1);
      expect(skills.resolveBatch).toHaveBeenCalledWith([
        { externalSystemId: TP_SYSTEM_ID, externalId: '41' },
        { externalSystemId: TP_SYSTEM_ID, externalId: '42' },
      ]);
      expect(errors).toEqual([]);
    });

    it('reports a failed lookup once and returns undefined', async () => {
      skills.resolveBatch.mockRejectedValue(new Error('db down'));

      const resolved = await service.resolveByTpId({
        masterIds: [98, 99],
        tpSystemId: TP_SYSTEM_ID,
        errors,
      });

      expect(resolved).toBeUndefined();
      expect(errors).toEqual([
        {
          item: { skillMasterIds: [98, 99] },
          message: 'Failed to resolve TP skill ids by external id: db down',
        },
      ]);
    });
  });
});
