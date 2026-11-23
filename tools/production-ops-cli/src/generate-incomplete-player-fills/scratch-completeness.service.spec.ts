import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import type { TpRosterCopyGroup } from '../read-tp-roster-snapshots/tp-roster-snapshots.schema';
import type { FillEntry, LastingInjuryRepairEntry } from './fill-plan.types';
import { ManualBatchFillsStoreService } from './manual-batch-fills-store.service';
import { ScratchCompletenessService } from './scratch-completeness.service';

function repair(id: string): LastingInjuryRepairEntry {
  return { player: { system: 'tourplay.net', id } };
}

function fill(id: string): FillEntry {
  return {
    player: { system: 'tourplay.net', id },
    status: 'retired',
    characteristics: { ma: 6, st: 3, ag: 3, pa: 4, av: 9 },
    sppTotal: 0,
    unspentSpp: 0,
    startingSkills: [],
    advancements: [],
  };
}

function group(
  rosterId: string,
  listed: string[],
  listedElsewhere: string[] = [],
): TpRosterCopyGroup {
  return {
    era: 'fourth-era',
    rosterId,
    chosen: [`fourth-era/s30/rosters_${rosterId}.json`],
    listed,
    listedElsewhere,
  };
}

const OUT =
  'tools/import-manual/data/batches/017-x/incomplete-player-fills.json5';

describe('ScratchCompletenessService', () => {
  let service: ScratchCompletenessService;
  let batches: MockProxy<ManualBatchFillsStoreService>;

  beforeEach(async () => {
    batches = mock<ManualBatchFillsStoreService>();
    batches.filledTpIds.mockResolvedValue(new Set());
    batches.batchOf.mockReturnValue('017-x');
    const moduleRef = await Test.createTestingModule({
      providers: [
        ScratchCompletenessService,
        { provide: ManualBatchFillsStoreService, useValue: batches },
      ],
    }).compile();
    service = moduleRef.get(ScratchCompletenessService);
  });

  it('keeps a player the copy the import sends lists', async () => {
    await expect(
      service.split({
        repairs: [repair('1')],
        rosterCopies: [group('164848', ['1'])],
        shown: [],
        runFills: [],
      }),
    ).resolves.toEqual({ safe: [repair('1')], unsafe: [] });
  });

  it('leaves out a player only a copy the import does not send lists', async () => {
    await expect(
      service.split({
        repairs: [repair('2463398')],
        rosterCopies: [group('164848', ['1'], ['2463398'])],
        shown: [],
        runFills: [],
      }),
    ).resolves.toEqual({ safe: [], unsafe: ['2463398'] });
  });

  it('leaves out a player a match shows whom no roster copy lists', async () => {
    await expect(
      service.split({
        repairs: [repair('9')],
        rosterCopies: [group('164848', ['1'])],
        shown: ['1', '9'],
        runFills: [],
      }),
    ).resolves.toEqual({ safe: [], unsafe: ['9'] });
  });

  it("leaves out a player one group sends and another group's older copy alone lists", async () => {
    await expect(
      service.split({
        repairs: [repair('1')],
        rosterCopies: [group('164848', ['1']), group('170000', [], ['1'])],
        shown: [],
        runFills: [],
      }),
    ).resolves.toEqual({ safe: [], unsafe: ['1'] });
  });

  it('keeps a player an earlier batch fills, reading the batches before the one written', async () => {
    batches.filledTpIds.mockResolvedValue(new Set(['2463398']));

    await expect(
      service.split({
        repairs: [repair('2463398')],
        rosterCopies: [group('164848', [], ['2463398'])],
        shown: [],
        runFills: [],
        out: OUT,
      }),
    ).resolves.toEqual({ safe: [repair('2463398')], unsafe: [] });
    expect(batches.batchOf).toHaveBeenCalledWith(OUT);
    expect(batches.filledTpIds).toHaveBeenCalledWith('017-x');
  });

  it('reads every batch when no path is given', async () => {
    await service.split({
      repairs: [],
      rosterCopies: [],
      shown: [],
      runFills: [],
    });

    expect(batches.batchOf).not.toHaveBeenCalled();
    expect(batches.filledTpIds).toHaveBeenCalledWith(undefined);
  });

  it('keeps a player the same run fills', async () => {
    await expect(
      service.split({
        repairs: [repair('9')],
        rosterCopies: [],
        shown: [],
        runFills: [fill('9')],
      }),
    ).resolves.toEqual({ safe: [repair('9')], unsafe: [] });
  });

  it('keeps the repairs in their order in both lists', async () => {
    await expect(
      service.split({
        repairs: [repair('3'), repair('1'), repair('4'), repair('2')],
        rosterCopies: [group('164848', ['1', '2'])],
        shown: ['1', '2', '3', '4'],
        runFills: [],
      }),
    ).resolves.toEqual({
      safe: [repair('1'), repair('2')],
      unsafe: ['3', '4'],
    });
  });

  it('keeps a player no downloaded file shows, whom a scratch build never creates', async () => {
    await expect(
      service.split({
        repairs: [repair('9')],
        rosterCopies: [group('164848', ['1'])],
        shown: ['1'],
        runFills: [],
      }),
    ).resolves.toEqual({ safe: [repair('9')], unsafe: [] });
  });

  it('keeps a player the same run fills though only an unsent copy lists him', async () => {
    await expect(
      service.split({
        repairs: [repair('2463398')],
        rosterCopies: [group('164848', ['1'], ['2463398'])],
        shown: ['1', '2463398'],
        runFills: [fill('2463398')],
      }),
    ).resolves.toEqual({ safe: [repair('2463398')], unsafe: [] });
  });

  it('leaves out a player of a group whose sent copy is unknown, unless he is filled', async () => {
    const undetermined: TpRosterCopyGroup = {
      era: 'fourth-era',
      rosterId: '164848',
      chosen: [],
      listed: [],
      listedElsewhere: ['1', '2'],
    };

    await expect(
      service.split({
        repairs: [repair('1'), repair('2')],
        rosterCopies: [undetermined],
        shown: ['1', '2'],
        runFills: [fill('2')],
      }),
    ).resolves.toEqual({ safe: [repair('2')], unsafe: ['1'] });
  });
});
