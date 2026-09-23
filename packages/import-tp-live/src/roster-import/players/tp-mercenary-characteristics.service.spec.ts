import type { ImportError } from '@blood-bowl-tracker/import';
import {
  ImportResultService,
  PositionRulesSetsImportService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { mockImportResultService } from '../../import-package.test-helpers';
import { TpMercenaryCharacteristicsService } from './tp-mercenary-characteristics.service';

const BB2020_ID = 900;

/** The curated BB2020 row for the Giant Mercenary, as the API returns it. */
const GIANT_BB2020_ROW = {
  rulesSetId: BB2020_ID,
  move: 6,
  strength: 7,
  agility: 5,
  passing: 5,
  armour: 11,
};

describe('TpMercenaryCharacteristicsService', () => {
  let service: TpMercenaryCharacteristicsService;
  let positionRulesSetsImport: MockProxy<PositionRulesSetsImportService>;
  let importResults: MockProxy<ImportResultService>;
  let errors: ImportError[];

  beforeEach(async () => {
    positionRulesSetsImport = mock<PositionRulesSetsImportService>();
    importResults = mockImportResultService();
    errors = [];

    const moduleRef = await Test.createTestingModule({
      providers: [
        TpMercenaryCharacteristicsService,
        {
          provide: PositionRulesSetsImportService,
          useValue: positionRulesSetsImport,
        },
        { provide: ImportResultService, useValue: importResults },
      ],
    }).compile();
    service = moduleRef.get(TpMercenaryCharacteristicsService);
  });

  describe('rulesSetNameByEraName', () => {
    it('maps each era declaring exactly one rules set to that name', () => {
      const byEraName = service.rulesSetNameByEraName([
        {
          name: 'Third Era',
          rulesSets: ['BB2020'],
        },
      ]);

      expect(byEraName.get('Third Era')).toBe('BB2020');
    });

    it('skips an era declaring zero or several rules sets', () => {
      const byEraName = service.rulesSetNameByEraName([
        {
          name: 'Ambiguous Era',
          rulesSets: ['BB2020', 'BB2025'],
        },
        {
          name: 'Empty Era',
          rulesSets: [],
        },
      ]);

      expect(byEraName.size).toBe(0);
    });
  });

  describe('loadPositionCharacteristics', () => {
    it("reads the position's curated rows once per position", async () => {
      positionRulesSetsImport.listPositionRulesSets.mockResolvedValue([
        GIANT_BB2020_ROW,
      ]);

      await service.loadPositionCharacteristics({
        positionName: 'Giant Mercenary',
        positionId: 77,
        errors,
      });

      expect(
        positionRulesSetsImport.listPositionRulesSets,
      ).toHaveBeenCalledWith(77, errors);
      expect(errors).toEqual([]);
    });

    it('records an error when the position has no curated rows at all', async () => {
      positionRulesSetsImport.listPositionRulesSets.mockResolvedValue([]);

      await service.loadPositionCharacteristics({
        positionName: 'Giant Mercenary',
        positionId: 77,
        errors,
      });

      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('Giant Mercenary');
    });

    it('records no second error when the read itself failed', async () => {
      // listPositionRulesSets already recorded its own error and resolved
      // undefined; duplicating it per position would only add noise.
      positionRulesSetsImport.listPositionRulesSets.mockResolvedValue(
        undefined,
      );

      await service.loadPositionCharacteristics({
        positionName: 'Giant Mercenary',
        positionId: 77,
        errors,
      });

      expect(errors).toEqual([]);
    });

    it('records an error for a curated row with no Passing value and leaves it uncached', async () => {
      // A player row cannot express a null Passing, so such a row cannot be
      // used for a hire; surfacing it here names the real problem instead of
      // letting each hire report a misleading "not curated".
      positionRulesSetsImport.listPositionRulesSets.mockResolvedValue([
        { ...GIANT_BB2020_ROW, passing: null },
      ]);

      await service.loadPositionCharacteristics({
        positionName: 'Giant Mercenary',
        positionId: 77,
        errors,
      });

      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('Passing');
    });
  });

  describe('forRosterPlayer', () => {
    it("returns the loaded row for the hire's rules set", async () => {
      positionRulesSetsImport.listPositionRulesSets.mockResolvedValue([
        GIANT_BB2020_ROW,
      ]);
      await service.loadPositionCharacteristics({
        positionName: 'Giant Mercenary',
        positionId: 77,
        errors,
      });

      const payload = service.forRosterPlayer({
        positionName: 'Giant Mercenary',
        player: { id: 5, name: 'Gronk' },
        rulesSet: { name: 'BB2020', id: BB2020_ID },
        errors,
      });

      expect(payload).toEqual({
        move: 6,
        strength: 7,
        agility: 5,
        passing: 5,
        armour: 11,
        rulesSetId: BB2020_ID,
      });
      expect(errors).toEqual([]);
    });

    it("records an error when the position has no row for this hire's rules set", async () => {
      positionRulesSetsImport.listPositionRulesSets.mockResolvedValue([
        GIANT_BB2020_ROW,
      ]);
      await service.loadPositionCharacteristics({
        positionName: 'Giant Mercenary',
        positionId: 77,
        errors,
      });

      const payload = service.forRosterPlayer({
        positionName: 'Giant Mercenary',
        player: { id: 5, name: 'Gronk' },
        rulesSet: { name: 'BB2025', id: 901 },
        errors,
      });

      expect(payload).toBeUndefined();
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('BB2025');
      expect(errors[0].message).toContain('Gronk');
    });

    it('records an error for a position that was never loaded', () => {
      const payload = service.forRosterPlayer({
        positionName: 'Giant Mercenary',
        player: { id: 5, name: 'Gronk' },
        rulesSet: { name: 'BB2020', id: BB2020_ID },
        errors,
      });

      expect(payload).toBeUndefined();
      expect(errors).toHaveLength(1);
    });

    it('does not record a second per-hire error when the read itself failed', async () => {
      // listPositionRulesSets already recorded its own error; every hire of
      // this position would otherwise repeat the same "not curated" message.
      positionRulesSetsImport.listPositionRulesSets.mockResolvedValue(
        undefined,
      );
      await service.loadPositionCharacteristics({
        positionName: 'Giant Mercenary',
        positionId: 77,
        errors,
      });
      expect(errors).toEqual([]);

      const payload = service.forRosterPlayer({
        positionName: 'Giant Mercenary',
        player: { id: 5, name: 'Gronk' },
        rulesSet: { name: 'BB2020', id: BB2020_ID },
        errors,
      });

      expect(payload).toBeUndefined();
      expect(errors).toEqual([]);
    });

    it('does not record a second per-hire error when the position has no curated rows at all', async () => {
      positionRulesSetsImport.listPositionRulesSets.mockResolvedValue([]);
      await service.loadPositionCharacteristics({
        positionName: 'Giant Mercenary',
        positionId: 77,
        errors,
      });
      expect(errors).toHaveLength(1);

      const payload = service.forRosterPlayer({
        positionName: 'Giant Mercenary',
        player: { id: 5, name: 'Gronk' },
        rulesSet: { name: 'BB2020', id: BB2020_ID },
        errors,
      });

      expect(payload).toBeUndefined();
      expect(errors).toHaveLength(1);
    });

    it('does not record a second per-hire error for a rules set rejected for null Passing', async () => {
      positionRulesSetsImport.listPositionRulesSets.mockResolvedValue([
        { ...GIANT_BB2020_ROW, passing: null },
      ]);
      await service.loadPositionCharacteristics({
        positionName: 'Giant Mercenary',
        positionId: 77,
        errors,
      });
      expect(errors).toHaveLength(1);

      const payload = service.forRosterPlayer({
        positionName: 'Giant Mercenary',
        player: { id: 5, name: 'Gronk' },
        rulesSet: { name: 'BB2020', id: BB2020_ID },
        errors,
      });

      expect(payload).toBeUndefined();
      expect(errors).toHaveLength(1);
    });

    it('returns undefined silently when the era resolved to no single rules set', () => {
      const payload = service.forRosterPlayer({
        positionName: 'Giant Mercenary',
        player: { id: 5, name: 'Gronk' },
        rulesSet: undefined,
        errors,
      });

      expect(payload).toBeUndefined();
      expect(errors).toEqual([]);
    });
  });
});
