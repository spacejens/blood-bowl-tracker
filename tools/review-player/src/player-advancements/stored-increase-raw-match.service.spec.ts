import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { StoredIncrease } from '../advancement-costs/advancement-cost-model.types';
import type { SampledPlayer } from '../shared/review.types';
import { BblPlayerAdvancementsReaderService } from '../source/bbl-player-advancements-reader.service';
import type { BblRawIncrease } from '../source/bbl-player-skills-cell.service';
import { StoredIncreaseRawMatchService } from './stored-increase-raw-match.service';

const player: SampledPlayer = {
  source: 'bbl',
  playerId: 5,
  externalId: '1000',
  playerName: 'Grim',
  teamName: 'Dwarf Giants',
  positionName: 'Blitzer',
  eraName: 'Fourth Era',
  selectedFor: ['Random sample'],
};

function stored(
  characteristic: StoredIncrease['characteristic'],
  advancementOrder: number | null,
): StoredIncrease {
  return { characteristic, advancementOrder, orderConfirmed: false };
}

async function makeService(markers: BblRawIncrease[] | null): Promise<{
  service: StoredIncreaseRawMatchService;
  bbl: MockProxy<BblPlayerAdvancementsReaderService>;
}> {
  const bbl = mock<BblPlayerAdvancementsReaderService>();
  bbl.read.mockResolvedValue(
    markers === null ? null : { skills: [], increases: markers },
  );
  const moduleRef = await Test.createTestingModule({
    providers: [
      StoredIncreaseRawMatchService,
      { provide: BblPlayerAdvancementsReaderService, useValue: bbl },
    ],
  }).compile();
  return { service: moduleRef.get(StoredIncreaseRawMatchService), bbl };
}

describe('StoredIncreaseRawMatchService', () => {
  it("does not compare a TP player's increases and reads nothing", async () => {
    const ma = stored('MA', 2);
    const { service, bbl } = await makeService([]);

    const match = await service.match({ ...player, source: 'tp' }, [ma]);

    expect(match.verdicts.get(ma)).toBe('not compared');
    expect(match.rawOnly).toEqual([]);
    expect(bbl.read).not.toHaveBeenCalled();
  });

  it('says not read when the BBL page is missing', async () => {
    const ma = stored('MA', 2);
    const { service } = await makeService(null);

    const match = await service.match(player, [ma]);

    expect(match.verdicts.get(ma)).toBe('not read');
  });

  it('matches stored increases equal to the markers', async () => {
    const ma = stored('MA', 2);
    const ag = stored('AG', 3);
    const { service } = await makeService([
      { characteristic: 'MA', advancementOrder: 2 },
      { characteristic: 'AG', advancementOrder: 3 },
    ]);

    const match = await service.match(player, [ma, ag]);

    expect(match.verdicts.get(ma)).toBe('yes');
    expect(match.verdicts.get(ag)).toBe('yes');
    expect(match.rawOnly).toEqual([]);
  });

  it('matches an unknown-order increase to a leftover marker of its characteristic', async () => {
    const ma = stored('MA', null);
    const { service } = await makeService([
      { characteristic: 'MA', advancementOrder: 4 },
    ]);

    const match = await service.match(player, [ma]);

    expect(match.verdicts.get(ma)).toBe('yes, order unknown');
  });

  it('pairs ordered increases first, then unknown-order ones', async () => {
    const unknown = stored('ST', null);
    const ordered = stored('ST', 5);
    const { service } = await makeService([
      { characteristic: 'ST', advancementOrder: 2 },
      { characteristic: 'ST', advancementOrder: 5 },
    ]);

    const match = await service.match(player, [unknown, ordered]);

    expect(match.verdicts.get(ordered)).toBe('yes');
    expect(match.verdicts.get(unknown)).toBe('yes, order unknown');
    expect(match.rawOnly).toEqual([]);
  });

  it('flags an extra unknown-order increase', async () => {
    const first = stored('AV', null);
    const second = stored('AV', null);
    const { service } = await makeService([
      { characteristic: 'AV', advancementOrder: 1 },
    ]);

    const match = await service.match(player, [first, second]);

    expect(match.verdicts.get(first)).toBe('yes, order unknown');
    expect(match.verdicts.get(second)).toBe('not in the raw source');
  });

  it('flags an ordered increase at another place and returns the marker as raw-only', async () => {
    const ma = stored('MA', 3);
    const { service } = await makeService([
      { characteristic: 'MA', advancementOrder: 2 },
    ]);

    const match = await service.match(player, [ma]);

    expect(match.verdicts.get(ma)).toBe('not in the raw source');
    expect(match.rawOnly).toEqual([
      { characteristic: 'MA', advancementOrder: 2 },
    ]);
  });

  it('returns a marker beyond the stored increases as raw-only', async () => {
    const { service } = await makeService([
      { characteristic: 'PA', advancementOrder: 1 },
      { characteristic: 'PA', advancementOrder: 2 },
    ]);

    const match = await service.match(player, [stored('PA', null)]);

    expect(match.rawOnly).toEqual([
      { characteristic: 'PA', advancementOrder: 2 },
    ]);
  });
});
