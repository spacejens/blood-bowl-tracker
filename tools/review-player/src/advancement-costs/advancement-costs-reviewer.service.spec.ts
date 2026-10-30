import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { SampledPlayer } from '../shared/review.types';
import { AdvancementCostsDbRendererService } from './advancement-costs-db-renderer.service';
import { AdvancementCostsReviewerService } from './advancement-costs-reviewer.service';
import { BblAdvancementCostsRawRendererService } from './bbl-advancement-costs-raw-renderer.service';
import { TpAdvancementCostsRawRendererService } from './tp-advancement-costs-raw-renderer.service';

function player(source: 'bbl' | 'tp'): SampledPlayer {
  return {
    source,
    playerId: 42,
    externalId: '1000',
    playerName: 'Grim Ironjaw',
    teamName: 'Reikland Reavers',
    positionName: 'Blitzer',
    eraName: 'Fourth Era',
    selectedFor: ['Source-reported spend outside the modelled spend range'],
  };
}

describe('AdvancementCostsReviewerService', () => {
  let service: AdvancementCostsReviewerService;
  let bblRaw: MockProxy<BblAdvancementCostsRawRendererService>;
  let tpRaw: MockProxy<TpAdvancementCostsRawRendererService>;
  let imported: MockProxy<AdvancementCostsDbRendererService>;

  beforeEach(async () => {
    bblRaw = mock<BblAdvancementCostsRawRendererService>();
    tpRaw = mock<TpAdvancementCostsRawRendererService>();
    imported = mock<AdvancementCostsDbRendererService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdvancementCostsReviewerService,
        { provide: BblAdvancementCostsRawRendererService, useValue: bblRaw },
        { provide: TpAdvancementCostsRawRendererService, useValue: tpRaw },
        { provide: AdvancementCostsDbRendererService, useValue: imported },
      ],
    }).compile();
    service = moduleRef.get(AdvancementCostsReviewerService);
  });

  it('identifies itself as the advancement-costs data type', () => {
    expect(service.id).toBe('advancement-costs');
  });

  it('renders the BBL raw panel for a BBL-sampled player', async () => {
    bblRaw.render.mockResolvedValue('<table>bbl</table>');

    expect(await service.getRawSource(player('bbl'))).toBe(
      '<table>bbl</table>',
    );
    expect(bblRaw.render).toHaveBeenCalledWith('1000');
    expect(tpRaw.render).not.toHaveBeenCalled();
  });

  it('renders the TP raw panel for a TP-sampled player', async () => {
    tpRaw.render.mockResolvedValue('<table>tp</table>');

    expect(await service.getRawSource(player('tp'))).toBe('<table>tp</table>');
    expect(tpRaw.render).toHaveBeenCalledWith('1000');
    expect(bblRaw.render).not.toHaveBeenCalled();
  });

  it('delegates the imported panel to the db renderer', async () => {
    imported.render.mockResolvedValue('<table>db</table>');
    const sampled = player('bbl');

    expect(await service.getImportedView(sampled)).toBe('<table>db</table>');
    expect(imported.render).toHaveBeenCalledWith(sampled);
  });
});
