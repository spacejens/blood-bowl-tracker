import type { ImportError } from '@blood-bowl-tracker/api-contract';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TpImportResultsService } from '../tp-import-results.service';
import { TpOfficialCharacteristicsSyncService } from './tp-official-characteristics-sync.service';
import { TpOfficialKeywordCatalogService } from './tp-official-keyword-catalog.service';
import { TpOfficialKeywordsSyncService } from './tp-official-keywords-sync.service';
import { TpOfficialPositionsUpsertService } from './tp-official-positions-upsert.service';
import { TpOfficialRacesUpsertService } from './tp-official-races-upsert.service';
import { TpOfficialSkillRefsService } from './tp-official-skill-refs.service';
import { TpOfficialStartingSkillsService } from './tp-official-starting-skills.service';
import {
  CHARACTERISTICS,
  officialRace,
  officialTeamsContext,
  positionSlot,
  RULES_SET_ID,
} from './tp-official-teams.test-helpers';
import { TpOfficialTeamsContextService } from './tp-official-teams-context.service';
import { TpOfficialTeamsImportService } from './tp-official-teams-import.service';

const pushError =
  (message: string) =>
  ({ errors }: { errors: ImportError[] }) => {
    errors.push({ item: null, message });
  };

describe('TpOfficialTeamsImportService', () => {
  let service: TpOfficialTeamsImportService;
  let context: MockProxy<TpOfficialTeamsContextService>;
  let racesUpsert: MockProxy<TpOfficialRacesUpsertService>;
  let positionsUpsert: MockProxy<TpOfficialPositionsUpsertService>;
  let characteristicsSync: MockProxy<TpOfficialCharacteristicsSyncService>;
  let keywordCatalog: MockProxy<TpOfficialKeywordCatalogService>;
  let keywordsSync: MockProxy<TpOfficialKeywordsSyncService>;
  let skillRefs: MockProxy<TpOfficialSkillRefsService>;
  let startingSkills: MockProxy<TpOfficialStartingSkillsService>;

  const races = [officialRace()];
  const racesByCode = new Map([['orc20', { raceId: 10, raceName: 'Orc' }]]);
  const slots = [positionSlot()];
  const catalog = { byCode: new Map() };
  const refsByPositionId = new Map([[9, [{ name: 'Block' }]]]);
  const positionCharacteristics = [
    { positionId: 9, rulesSetId: RULES_SET_ID, ...CHARACTERISTICS },
  ];

  beforeEach(async () => {
    context = mock<TpOfficialTeamsContextService>();
    context.resolve.mockResolvedValue(officialTeamsContext());
    racesUpsert = mock<TpOfficialRacesUpsertService>();
    racesUpsert.upsertRaces.mockResolvedValue({ imported: 1, racesByCode });
    positionsUpsert = mock<TpOfficialPositionsUpsertService>();
    positionsUpsert.upsertPositions.mockResolvedValue({ imported: 1, slots });
    characteristicsSync = mock<TpOfficialCharacteristicsSyncService>();
    characteristicsSync.syncCharacteristics.mockResolvedValue({
      imported: 1,
      positionCharacteristics,
    });
    keywordCatalog = mock<TpOfficialKeywordCatalogService>();
    keywordCatalog.load.mockResolvedValue(catalog);
    keywordsSync = mock<TpOfficialKeywordsSyncService>();
    keywordsSync.syncKeywords.mockResolvedValue(2);
    skillRefs = mock<TpOfficialSkillRefsService>();
    skillRefs.resolve.mockResolvedValue(refsByPositionId);
    startingSkills = mock<TpOfficialStartingSkillsService>();
    startingSkills.syncStartingSkills.mockResolvedValue(3);
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpOfficialTeamsImportService,
        TpImportResultsService,
        { provide: TpOfficialTeamsContextService, useValue: context },
        { provide: TpOfficialRacesUpsertService, useValue: racesUpsert },
        {
          provide: TpOfficialPositionsUpsertService,
          useValue: positionsUpsert,
        },
        {
          provide: TpOfficialCharacteristicsSyncService,
          useValue: characteristicsSync,
        },
        { provide: TpOfficialKeywordCatalogService, useValue: keywordCatalog },
        { provide: TpOfficialKeywordsSyncService, useValue: keywordsSync },
        { provide: TpOfficialSkillRefsService, useValue: skillRefs },
        { provide: TpOfficialStartingSkillsService, useValue: startingSkills },
      ],
    }).compile();
    service = moduleRef.get(TpOfficialTeamsImportService);
  });

  it('runs every stage in order, threading each output into the next', async () => {
    const skillMasters = [{ skillMasterId: 41, name: 'Block', isElite: false }];

    const result = await service.importOfficialTeams({
      rulesSet: 'BB2020',
      races,
      skillMasters,
      externalSystemName: 'TP',
    });

    expect(context.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ rulesSet: 'BB2020', externalSystemName: 'TP' }),
    );
    expect(racesUpsert.upsertRaces).toHaveBeenCalledWith(
      expect.objectContaining({ races, context: officialTeamsContext() }),
    );
    expect(positionsUpsert.upsertPositions).toHaveBeenCalledWith(
      expect.objectContaining({ races, racesByCode }),
    );
    expect(characteristicsSync.syncCharacteristics).toHaveBeenCalledWith(
      expect.objectContaining({ slots }),
    );
    expect(keywordCatalog.load).toHaveBeenCalledWith(
      expect.objectContaining({ tpSystemId: 1 }),
    );
    expect(keywordsSync.syncKeywords).toHaveBeenCalledWith(
      expect.objectContaining({ slots, catalog }),
    );
    expect(skillRefs.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ slots, skillMasters, catalog }),
    );
    expect(startingSkills.syncStartingSkills).toHaveBeenCalledWith(
      expect.objectContaining({ refsByPositionId }),
    );
    const characteristicsOrder =
      characteristicsSync.syncCharacteristics.mock.invocationCallOrder[0];
    expect(characteristicsOrder).toBeLessThan(
      keywordsSync.syncKeywords.mock.invocationCallOrder[0],
    );
    expect(characteristicsOrder).toBeLessThan(
      startingSkills.syncStartingSkills.mock.invocationCallOrder[0],
    );
    expect(result).toEqual({
      races: { success: true, imported: 1, errors: [] },
      positions: { success: true, imported: 1, errors: [] },
      characteristics: { success: true, imported: 1, errors: [] },
      keywords: { success: true, imported: 2, errors: [] },
      startingSkills: { success: true, imported: 3, errors: [] },
      positionCharacteristics,
    });
  });

  it("keeps each stage's errors in its own result", async () => {
    racesUpsert.upsertRaces.mockImplementation((options) => {
      pushError('race failed')(options);
      return Promise.resolve({ imported: 0, racesByCode });
    });
    keywordCatalog.load.mockImplementation((options) => {
      pushError('catalogue failed')(options);
      return Promise.resolve(catalog);
    });
    skillRefs.resolve.mockImplementation((options) => {
      pushError('skill unresolved')(options);
      return Promise.resolve(refsByPositionId);
    });

    const result = await service.importOfficialTeams({
      rulesSet: 'BB2020',
      races,
      externalSystemName: 'TP',
    });

    expect(result.races.errors).toEqual([
      { item: null, message: 'race failed' },
    ]);
    expect(result.positions.errors).toEqual([]);
    expect(result.keywords.errors).toEqual([
      { item: null, message: 'catalogue failed' },
    ]);
    expect(result.startingSkills.errors).toEqual([
      { item: null, message: 'skill unresolved' },
    ]);
  });

  it('defaults to no skill master names', async () => {
    await service.importOfficialTeams({
      rulesSet: 'BB2020',
      races,
      externalSystemName: 'TP',
    });

    expect(skillRefs.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ skillMasters: [] }),
    );
  });

  it('imports nothing, reporting the context failure under races, when the context cannot be resolved', async () => {
    context.resolve.mockImplementation((options) => {
      pushError('unknown rules set')(options);
      return Promise.resolve(undefined);
    });

    const result = await service.importOfficialTeams({
      rulesSet: 'BB2016',
      races,
      externalSystemName: 'TP',
    });

    expect(racesUpsert.upsertRaces).not.toHaveBeenCalled();
    const nothing = { success: true, imported: 0, errors: [] };
    expect(result).toEqual({
      races: {
        success: false,
        imported: 0,
        errors: [{ item: null, message: 'unknown rules set' }],
      },
      positions: nothing,
      characteristics: nothing,
      keywords: nothing,
      startingSkills: nothing,
      positionCharacteristics: [],
    });
  });
});
