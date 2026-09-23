import type { ImportError } from '@blood-bowl-tracker/api-contract';
import { PositionRulesSetsService } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpImportResultsService } from '../../tp-import-results.service';
import { TpUpsertRunnerService } from '../../tp-upsert-runner.service';
import type { MercenaryCurated } from './tp-mercenary-characteristics.service';
import { TpMercenaryCharacteristicsService } from './tp-mercenary-characteristics.service';

const BB2020_ID = 900;

/** The curated BB2020 row for the Giant Mercenary, as game-data returns it. */
const GIANT_BB2020_ROW = {
  rulesSetId: BB2020_ID,
  rulesSetName: 'BB2020',
  moveFormat: 'bare' as const,
  move: 6,
  strengthFormat: 'bare' as const,
  strength: 7,
  agilityFormat: 'plus' as const,
  agility: 5,
  passingFormat: 'plus' as const,
  passing: 5,
  armourFormat: 'plus' as const,
  armour: 11,
};

describe('TpMercenaryCharacteristicsService', () => {
  let service: TpMercenaryCharacteristicsService;
  let positionRulesSets: MockProxy<PositionRulesSetsService>;
  let errors: ImportError[];

  beforeEach(async () => {
    positionRulesSets = mock<PositionRulesSetsService>();
    errors = [];

    const moduleRef = await Test.createTestingModule({
      providers: [
        TpMercenaryCharacteristicsService,
        TpImportResultsService,
        TpUpsertRunnerService,
        { provide: PositionRulesSetsService, useValue: positionRulesSets },
      ],
    }).compile();
    service = moduleRef.get(TpMercenaryCharacteristicsService);
  });

  describe('loadPositionCharacteristics', () => {
    it("reads the position's curated rows once per position", async () => {
      positionRulesSets.listByPosition.mockResolvedValue([GIANT_BB2020_ROW]);

      const curated = await service.loadPositionCharacteristics({
        positionName: 'Giant Mercenary',
        positionId: 55,
        errors,
      });

      expect(positionRulesSets.listByPosition).toHaveBeenCalledTimes(1);
      expect(positionRulesSets.listByPosition).toHaveBeenCalledWith(55);
      expect(curated).toEqual({
        loaded: true,
        byRulesSetId: new Map([
          [
            BB2020_ID,
            { move: 6, strength: 7, agility: 5, passing: 5, armour: 11 },
          ],
        ]),
        rejectedRulesSetIds: new Set(),
      });
      expect(errors).toEqual([]);
    });

    it('records no second error when the read itself failed', async () => {
      positionRulesSets.listByPosition.mockRejectedValue(new Error('boom'));

      const curated = await service.loadPositionCharacteristics({
        positionName: 'Giant Mercenary',
        positionId: 55,
        errors,
      });

      expect(curated).toEqual({ loaded: false });
      expect(errors.map((error) => error.message)).toEqual([
        'Failed to list characteristics for position 55: boom',
      ]);
    });

    it('records an error when the position has no curated rows at all', async () => {
      positionRulesSets.listByPosition.mockResolvedValue([]);

      const curated = await service.loadPositionCharacteristics({
        positionName: 'Giant Mercenary',
        positionId: 55,
        errors,
      });

      expect(curated).toEqual({ loaded: false });
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('Giant Mercenary');
      expect(errors[0].message).toContain('no position_rules_sets row at all');
    });

    it('records an error for a curated row with no Passing value and leaves it uncached', async () => {
      positionRulesSets.listByPosition.mockResolvedValue([
        { ...GIANT_BB2020_ROW, passing: null },
      ]);

      const curated = await service.loadPositionCharacteristics({
        positionName: 'Giant Mercenary',
        positionId: 55,
        errors,
      });

      expect(curated).toEqual({
        loaded: true,
        byRulesSetId: new Map(),
        rejectedRulesSetIds: new Set([BB2020_ID]),
      });
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('Passing');
    });
  });

  describe('forRosterPlayer', () => {
    it("returns the loaded row for the hire's rules set", () => {
      const curated: MercenaryCurated = {
        loaded: true,
        byRulesSetId: new Map([
          [
            BB2020_ID,
            { move: 6, strength: 7, agility: 5, passing: 5, armour: 11 },
          ],
        ]),
        rejectedRulesSetIds: new Set(),
      };

      const payload = service.forRosterPlayer({
        curated,
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

    it('records an error when loaded but without that rules set', () => {
      const curated: MercenaryCurated = {
        loaded: true,
        byRulesSetId: new Map(),
        rejectedRulesSetIds: new Set(),
      };

      const payload = service.forRosterPlayer({
        curated,
        positionName: 'Giant Mercenary',
        player: { id: 5, name: 'Gronk' },
        rulesSet: { name: 'BB2025', id: 901 },
        errors,
      });

      expect(payload).toBeUndefined();
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('BB2025');
      expect(errors[0].message).toContain('Gronk');
      expect(errors[0].message).toContain('has no curated entry for rules set');
    });

    it('returns undefined with no error when the read failed or found no rows', () => {
      const payload = service.forRosterPlayer({
        curated: { loaded: false },
        positionName: 'Giant Mercenary',
        player: { id: 5, name: 'Gronk' },
        rulesSet: { name: 'BB2020', id: BB2020_ID },
        errors,
      });

      expect(payload).toBeUndefined();
      expect(errors).toEqual([]);
    });

    it('returns undefined with no error for a rules set in rejectedRulesSetIds', () => {
      const curated: MercenaryCurated = {
        loaded: true,
        byRulesSetId: new Map(),
        rejectedRulesSetIds: new Set([BB2020_ID]),
      };

      const payload = service.forRosterPlayer({
        curated,
        positionName: 'Giant Mercenary',
        player: { id: 5, name: 'Gronk' },
        rulesSet: { name: 'BB2020', id: BB2020_ID },
        errors,
      });

      expect(payload).toBeUndefined();
      expect(errors).toEqual([]);
    });

    it('returns undefined with no error when the era resolved to no single rules set', () => {
      const payload = service.forRosterPlayer({
        curated: { loaded: false },
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
