import {
  ImportResultService,
  TrophiesImportService,
  TrophyAwardsImportService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { ManualDataFile } from '../data-file/manual-data-file.schema';
import type { ProcessContext } from '../references/process-context';
import { ReferenceResolverService } from '../references/reference-resolver.service';
import { TrophyAwardsProcessor } from './trophy-awards.processor';

const entry = {
  trophy: 'Season MVP',
  competition: { system: 'tloeg.bbleague.se', id: '10' },
  player: { system: 'tloeg.bbleague.se', id: '388' },
};

const awardRow = {
  id: 77,
  trophyId: 31,
  competitionId: 12,
  teamEraId: 5,
  playerId: 9,
  createdAt: new Date('2026-01-01'),
  created: true,
};

function emptyData(): ManualDataFile {
  return {
    externalSystems: [],
    rulesSets: [],
    leagues: [],
    eras: [],
    races: [],
    positions: [],
    positionRulesSets: [],
    coaches: [],
    teams: [],
    competitions: [],
    sppAwardValues: [],
    trophies: [],
    competitionGroups: [],
    trophyAwards: [],
  };
}

function makeContext(data: ManualDataFile): ProcessContext {
  return {
    data,
    systemIds: new Map([
      ['Name', 2],
      ['tloeg.bbleague.se', 1],
    ]),
    errors: [],
  };
}

describe('TrophyAwardsProcessor', () => {
  let processor: TrophyAwardsProcessor;
  let awards: MockProxy<TrophyAwardsImportService>;
  let trophies: MockProxy<TrophiesImportService>;
  let refResolver: MockProxy<ReferenceResolverService>;
  let importResults: MockProxy<ImportResultService>;

  beforeEach(async () => {
    awards = mock<TrophyAwardsImportService>();
    trophies = mock<TrophiesImportService>();
    refResolver = mock<ReferenceResolverService>();
    importResults = mock<ImportResultService>();
    importResults.error.mockReturnValue({
      item: entry,
      message: 'canned error',
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        TrophyAwardsProcessor,
        { provide: TrophyAwardsImportService, useValue: awards },
        { provide: TrophiesImportService, useValue: trophies },
        { provide: ReferenceResolverService, useValue: refResolver },
        { provide: ImportResultService, useValue: importResults },
      ],
    }).compile();
    processor = moduleRef.get(TrophyAwardsProcessor);
  });

  it('imports nothing for a file with no awards', async () => {
    const ctx = makeContext(emptyData());

    await expect(processor.process(ctx)).resolves.toBe(0);
    expect(awards.upsert).not.toHaveBeenCalled();
    expect(ctx.errors).toEqual([]);
  });

  it('resolves the trophy by name and the competition and player by external id', async () => {
    trophies.resolveByName.mockResolvedValue(31);
    refResolver.resolveRef.mockResolvedValueOnce(12).mockResolvedValueOnce(9);
    awards.upsert.mockResolvedValue(awardRow);
    const ctx = makeContext({ ...emptyData(), trophyAwards: [entry] });

    await expect(processor.process(ctx)).resolves.toBe(1);

    expect(trophies.resolveByName).toHaveBeenCalledWith(
      'Season MVP',
      ctx.errors,
    );
    expect(refResolver.resolveRef).toHaveBeenCalledWith(
      expect.objectContaining({ ref: entry.competition, kind: 'competition' }),
    );
    expect(refResolver.resolveRef).toHaveBeenCalledWith(
      expect.objectContaining({ ref: entry.player, kind: 'player' }),
    );
  });

  it('sends no teamEraId, leaving the server to derive it from the player', async () => {
    trophies.resolveByName.mockResolvedValue(31);
    refResolver.resolveRef.mockResolvedValueOnce(12).mockResolvedValueOnce(9);
    awards.upsert.mockResolvedValue(awardRow);
    const ctx = makeContext({ ...emptyData(), trophyAwards: [entry] });

    await processor.process(ctx);

    expect(awards.upsert).toHaveBeenCalledWith(
      { trophyId: 31, competitionId: 12, playerId: 9 },
      ctx.errors,
    );
  });

  it('skips an entry naming a trophy no catalog row carries', async () => {
    trophies.resolveByName.mockResolvedValue(undefined);
    const ctx = makeContext({ ...emptyData(), trophyAwards: [entry] });

    await expect(processor.process(ctx)).resolves.toBe(0);
    expect(awards.upsert).not.toHaveBeenCalled();
    expect(refResolver.resolveRef).not.toHaveBeenCalled();
    expect(ctx.errors).toHaveLength(1);
    const [recorded] = importResults.error.mock.calls[0];
    expect(recorded.item).toBe(entry);
    expect(recorded.message).toContain('Season MVP');
  });

  it('skips an entry whose competition does not resolve', async () => {
    trophies.resolveByName.mockResolvedValue(31);
    refResolver.resolveRef.mockResolvedValue(undefined);
    const ctx = makeContext({ ...emptyData(), trophyAwards: [entry] });

    await expect(processor.process(ctx)).resolves.toBe(0);
    expect(awards.upsert).not.toHaveBeenCalled();
    // The player is never looked up once the competition is already missing.
    expect(refResolver.resolveRef).toHaveBeenCalledTimes(1);
  });

  it('skips an entry whose player does not resolve', async () => {
    trophies.resolveByName.mockResolvedValue(31);
    refResolver.resolveRef
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(undefined);
    const ctx = makeContext({ ...emptyData(), trophyAwards: [entry] });

    await expect(processor.process(ctx)).resolves.toBe(0);
    expect(awards.upsert).not.toHaveBeenCalled();
  });

  it('counts only the entries whose upsert succeeded', async () => {
    trophies.resolveByName.mockResolvedValue(31);
    refResolver.resolveRef.mockResolvedValue(9);
    awards.upsert
      .mockResolvedValueOnce(awardRow)
      .mockResolvedValueOnce(undefined);
    const ctx = makeContext({
      ...emptyData(),
      trophyAwards: [entry, { ...entry, trophy: 'Gudarnas Förkämpe' }],
    });

    await expect(processor.process(ctx)).resolves.toBe(1);
    expect(awards.upsert).toHaveBeenCalledTimes(2);
  });
});
