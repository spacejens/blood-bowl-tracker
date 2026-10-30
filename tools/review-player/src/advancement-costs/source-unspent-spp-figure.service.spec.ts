import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { BblUnspentSppReaderService } from '../source/bbl-unspent-spp-reader.service';
import { TpRawPlayerSkillsIndexService } from '../source/tp-raw-player-skills-index.service';
import { SourceUnspentSppFigureService } from './source-unspent-spp-figure.service';

describe('SourceUnspentSppFigureService', () => {
  let service: SourceUnspentSppFigureService;
  let bbl: MockProxy<BblUnspentSppReaderService>;
  let tp: MockProxy<TpRawPlayerSkillsIndexService>;

  beforeEach(async () => {
    bbl = mock<BblUnspentSppReaderService>();
    tp = mock<TpRawPlayerSkillsIndexService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        SourceUnspentSppFigureService,
        { provide: BblUnspentSppReaderService, useValue: bbl },
        { provide: TpRawPlayerSkillsIndexService, useValue: tp },
      ],
    }).compile();
    service = moduleRef.get(SourceUnspentSppFigureService);
  });

  it("reads a BBL player's figures from the Unspent SPP row", async () => {
    bbl.read.mockResolvedValue({ unspent: -4, careerTotal: 34 });

    expect(
      await service.figureFor({ source: 'bbl', externalId: '1020' }),
    ).toEqual({
      source: 'bbl',
      unspentLabel: 'BBL Unspent SPP',
      unspent: -4,
      totalLabel: 'BBL career SPP (bracketed)',
      reportedTotal: 34,
      spendLabel: 'BBL spent SPP (career minus unspent)',
    });
    expect(bbl.read).toHaveBeenCalledWith('1020');
  });

  it('passes through a BBL page that reports no figure', async () => {
    bbl.read.mockResolvedValue({ unspent: null, careerTotal: null });

    expect(await service.figureFor({ source: 'bbl', externalId: '5' })).toEqual(
      {
        source: 'bbl',
        unspentLabel: 'BBL Unspent SPP',
        unspent: null,
        totalLabel: 'BBL career SPP (bracketed)',
        reportedTotal: null,
        spendLabel: 'BBL spent SPP (career minus unspent)',
      },
    );
  });

  it("reads a TP player's figures from the roster entry", async () => {
    tp.sppFiguresFor.mockResolvedValue({
      totalStarPlayerPoints: 16,
      starPlayerPoints: 4,
      pendingImprovements: 0,
    });

    expect(await service.figureFor({ source: 'tp', externalId: '77' })).toEqual(
      {
        source: 'tp',
        unspentLabel: 'TP starPlayerPoints',
        unspent: 4,
        totalLabel: 'TP totalStarPlayerPoints',
        reportedTotal: 16,
        spendLabel: 'TP spent SPP (total minus starPlayerPoints)',
      },
    );
    expect(tp.sppFiguresFor).toHaveBeenCalledWith('77');
  });

  it('passes through a TP entry that reports no figure', async () => {
    tp.sppFiguresFor.mockResolvedValue({
      totalStarPlayerPoints: null,
      starPlayerPoints: null,
      pendingImprovements: null,
    });

    expect(await service.figureFor({ source: 'tp', externalId: '77' })).toEqual(
      {
        source: 'tp',
        unspentLabel: 'TP starPlayerPoints',
        unspent: null,
        totalLabel: 'TP totalStarPlayerPoints',
        reportedTotal: null,
        spendLabel: 'TP spent SPP (total minus starPlayerPoints)',
      },
    );
  });

  it('returns null when the BBL mirror has no page', async () => {
    bbl.read.mockResolvedValue(null);

    expect(
      await service.figureFor({ source: 'bbl', externalId: '1' }),
    ).toBeNull();
  });

  it('returns null when no TP roster file carries the player', async () => {
    tp.sppFiguresFor.mockResolvedValue(null);

    expect(
      await service.figureFor({ source: 'tp', externalId: '1' }),
    ).toBeNull();
  });

  it('returns null for the manual source', async () => {
    expect(
      await service.figureFor({ source: 'manual', externalId: '1' }),
    ).toBeNull();
    expect(bbl.read).not.toHaveBeenCalled();
    expect(tp.sppFiguresFor).not.toHaveBeenCalled();
  });
});
