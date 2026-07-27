import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import type { SampledMatch } from '../shared/review.types';
import { BblMatchEventsRawRendererService } from './bbl-match-events-raw-renderer.service';
import { MatchEventsDbRendererService } from './match-events-db-renderer.service';
import { MatchEventsReviewerService } from './match-events-reviewer.service';
import { TpMatchEventsRawRendererService } from './tp-match-events-raw-renderer.service';

interface Harness {
  service: MatchEventsReviewerService;
  bbl: MockProxy<BblMatchEventsRawRendererService>;
  tp: MockProxy<TpMatchEventsRawRendererService>;
  db: MockProxy<MatchEventsDbRendererService>;
}

async function makeHarness(): Promise<Harness> {
  const bbl = mock<BblMatchEventsRawRendererService>();
  const tp = mock<TpMatchEventsRawRendererService>();
  const db = mock<MatchEventsDbRendererService>();
  bbl.render.mockResolvedValue('<p>bbl raw</p>');
  tp.render.mockResolvedValue('<p>tp raw</p>');
  db.render.mockResolvedValue('<p>imported</p>');
  const moduleRef = await Test.createTestingModule({
    providers: [
      MatchEventsReviewerService,
      { provide: BblMatchEventsRawRendererService, useValue: bbl },
      { provide: TpMatchEventsRawRendererService, useValue: tp },
      { provide: MatchEventsDbRendererService, useValue: db },
    ],
  }).compile();
  return {
    service: moduleRef.get(MatchEventsReviewerService),
    bbl,
    tp,
    db,
  };
}

const match = (source: 'bbl' | 'tp'): SampledMatch => ({
  source,
  matchId: 11,
  externalId: source === 'bbl' ? '1830' : '344820',
  matchName: 'Round 3',
  competitionName: 'Season 18',
  playedAt: new Date('2021-09-25T18:00:00.000Z'),
  selectedFor: ['Contains a foul'],
});

describe('MatchEventsReviewerService', () => {
  it('identifies itself as the match-events data type', async () => {
    const { service } = await makeHarness();

    expect(service.id).toBe('match-events');
  });

  it('renders the BBL raw panel for a BBL match', async () => {
    const { service, bbl, tp } = await makeHarness();

    await expect(service.getRawSource(match('bbl'))).resolves.toBe(
      '<p>bbl raw</p>',
    );
    expect(bbl.render).toHaveBeenCalledWith('1830');
    expect(tp.render).not.toHaveBeenCalled();
  });

  it('renders the TP raw panel for a TP match', async () => {
    const { service, bbl, tp } = await makeHarness();

    await expect(service.getRawSource(match('tp'))).resolves.toBe(
      '<p>tp raw</p>',
    );
    expect(tp.render).toHaveBeenCalledWith('344820');
    expect(bbl.render).not.toHaveBeenCalled();
  });

  it('renders the imported panel from the database for either source', async () => {
    const { service, db } = await makeHarness();

    await expect(service.getImportedView(match('tp'))).resolves.toBe(
      '<p>imported</p>',
    );
    expect(db.render).toHaveBeenCalledWith(match('tp'));
  });
});
