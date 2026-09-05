import type { ImportError } from '@blood-bowl-tracker/import';
import {
  ImportResultService,
  PositionRulesSetsImportService,
  ReferenceLookupService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import {
  mockImportResultService,
  mockReferenceLookupService,
} from '../import-package.test-helpers';
import { MercenaryCharacteristicsConfigService } from './mercenary-characteristics-config.service';
import { TpMercenaryCharacteristicsService } from './tp-mercenary-characteristics.service';

const TP_SYSTEM_ID = 1;

/** The curated BB2020 line for the Giant Mercenary, as a canned mock value. */
const GIANT_BB2020 = {
  move: 6,
  strength: 7,
  agility: 5,
  passing: 5,
  armour: 11,
};

describe('TpMercenaryCharacteristicsService', () => {
  let service: TpMercenaryCharacteristicsService;
  let config: MockProxy<MercenaryCharacteristicsConfigService>;
  let positionRulesSetsImport: MockProxy<PositionRulesSetsImportService>;
  let importResults: MockProxy<ImportResultService>;
  let lookup: MockProxy<ReferenceLookupService>;
  let errors: ImportError[];

  beforeEach(async () => {
    config = mock<MercenaryCharacteristicsConfigService>();
    positionRulesSetsImport = mock<PositionRulesSetsImportService>();
    importResults = mockImportResultService();
    lookup = mockReferenceLookupService(new Map(), TP_SYSTEM_ID, {
      rulesSetIdsByName: new Map([['BB2020', 900]]),
    });
    errors = [];

    const moduleRef = await Test.createTestingModule({
      providers: [
        TpMercenaryCharacteristicsService,
        {
          provide: MercenaryCharacteristicsConfigService,
          useValue: config,
        },
        {
          provide: PositionRulesSetsImportService,
          useValue: positionRulesSetsImport,
        },
        { provide: ImportResultService, useValue: importResults },
        { provide: ReferenceLookupService, useValue: lookup },
      ],
    }).compile();
    service = moduleRef.get(TpMercenaryCharacteristicsService);
  });

  describe('rulesSetNameByEraName', () => {
    it('maps each era declaring exactly one rules set to that name', () => {
      const byEraName = service.rulesSetNameByEraName([
        {
          name: 'Third Era',
          dataSubdir: 'third-era',
          rulesSets: ['BB2020'],
          startDate: '2020-01-01',
        },
      ]);

      expect(byEraName.get('Third Era')).toBe('BB2020');
    });

    it('skips an era declaring zero or several rules sets', () => {
      const byEraName = service.rulesSetNameByEraName([
        {
          name: 'Ambiguous Era',
          dataSubdir: 'ambiguous',
          rulesSets: ['BB2020', 'BB2025'],
          startDate: '2020-01-01',
        },
        {
          name: 'Empty Era',
          dataSubdir: 'empty',
          rulesSets: [],
          startDate: '2020-01-01',
        },
      ]);

      expect(byEraName.size).toBe(0);
    });
  });

  describe('syncPositionCharacteristics', () => {
    it('syncs one position/rules-set entry per curated rules set', async () => {
      config.forPosition.mockReturnValue(new Map([['BB2020', GIANT_BB2020]]));

      await service.syncPositionCharacteristics({
        positionName: 'Giant Mercenary',
        positionId: 800,
        tpSystemId: TP_SYSTEM_ID,
        errors,
      });

      expect(
        positionRulesSetsImport.syncPositionRulesSets,
      ).toHaveBeenCalledWith(
        {
          entries: [
            {
              positionId: 800,
              rulesSetId: 900,
              move: 6,
              strength: 7,
              agility: 5,
              passing: 5,
              armour: 11,
            },
          ],
        },
        errors,
      );
      expect(errors).toHaveLength(0);
    });

    it('records an error and syncs nothing for an uncurated mercenary name', async () => {
      config.forPosition.mockReturnValue(undefined);

      await service.syncPositionCharacteristics({
        positionName: 'Bogus Mercenary',
        positionId: 800,
        tpSystemId: TP_SYSTEM_ID,
        errors,
      });

      expect(
        positionRulesSetsImport.syncPositionRulesSets,
      ).not.toHaveBeenCalled();
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('Bogus Mercenary');
    });

    it('records an error and syncs nothing when the curated rules set cannot be resolved', async () => {
      config.forPosition.mockReturnValue(new Map([['BB1999', GIANT_BB2020]]));

      await service.syncPositionCharacteristics({
        positionName: 'Giant Mercenary',
        positionId: 800,
        tpSystemId: TP_SYSTEM_ID,
        errors,
      });

      expect(
        positionRulesSetsImport.syncPositionRulesSets,
      ).not.toHaveBeenCalled();
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('BB1999');
    });
  });

  describe('forRosterPlayer', () => {
    it("returns the curated characteristics with the era's rules set id", () => {
      config.forPositionAndRulesSet.mockReturnValue(GIANT_BB2020);

      const payload = service.forRosterPlayer({
        positionName: 'Giant Mercenary',
        player: { id: 1399322, name: 'Giant' },
        rulesSet: { name: 'BB2020', id: 900 },
        errors,
      });

      expect(payload).toEqual({
        move: 6,
        strength: 7,
        agility: 5,
        passing: 5,
        armour: 11,
        rulesSetId: 900,
      });
      expect(config.forPositionAndRulesSet).toHaveBeenCalledWith({
        positionName: 'Giant Mercenary',
        rulesSetName: 'BB2020',
      });
      expect(errors).toHaveLength(0);
    });

    it('records an error and returns undefined when the rules set is uncurated for that name', () => {
      config.forPositionAndRulesSet.mockReturnValue(undefined);

      const payload = service.forRosterPlayer({
        positionName: 'Giant Mercenary',
        player: { id: 1399322, name: 'Giant' },
        rulesSet: { name: 'BB2025', id: 902 },
        errors,
      });

      expect(payload).toBeUndefined();
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('Giant Mercenary');
      expect(errors[0].message).toContain('BB2025');
    });

    it('returns undefined without an extra error when the era resolved to no rules set', () => {
      const payload = service.forRosterPlayer({
        positionName: 'Giant Mercenary',
        player: { id: 1399322, name: 'Giant' },
        rulesSet: undefined,
        errors,
      });

      expect(payload).toBeUndefined();
      expect(config.forPositionAndRulesSet).not.toHaveBeenCalled();
      expect(errors).toHaveLength(0);
    });
  });
});
