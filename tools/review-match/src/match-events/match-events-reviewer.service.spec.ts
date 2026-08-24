import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import type { SampledMatch } from '../shared/review.types';
import { BblMatchEventsRawRendererService } from './bbl-match-events-raw-renderer.service';
import { MatchEventsDbRendererService } from './match-events-db-renderer.service';
import { MatchEventsReviewerService } from './match-events-reviewer.service';
import { TpMatchEventsRawRendererService } from './tp-match-events-raw-renderer.service';

const match = (source: 'bbl' | 'tp'): SampledMatch => ({
  source,
  matchId: 11,
  externalId: source === 'bbl' ? '1830' : '344820',
  matchName: 'Round 3',
  competitionName: 'Season 18',
  playedAt: new Date('2021-09-25T18:00:00.000Z'),
  category: 'normal',
  selectedFor: ['Contains a foul'],
});

describe('MatchEventsReviewerService', () => {
  let service: MatchEventsReviewerService;
  let bbl: MockProxy<BblMatchEventsRawRendererService>;
  let tp: MockProxy<TpMatchEventsRawRendererService>;
  let db: MockProxy<MatchEventsDbRendererService>;

  beforeEach(async () => {
    bbl = mock<BblMatchEventsRawRendererService>();
    tp = mock<TpMatchEventsRawRendererService>();
    db = mock<MatchEventsDbRendererService>();
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
    service = moduleRef.get(MatchEventsReviewerService);
  });

  it('identifies itself as the match-events data type', () => {
    expect(service.id).toBe('match-events');
  });

  it('renders the BBL raw panel for a BBL match', async () => {
    await expect(service.getRawSource(match('bbl'))).resolves.toBe(
      '<p>bbl raw</p>',
    );
    expect(bbl.render).toHaveBeenCalledWith(['1830']);
    expect(tp.render).not.toHaveBeenCalled();
  });

  it('renders both source pages for a BBL match merged from two rows', async () => {
    await service.getRawSource({
      ...match('bbl'),
      secondaryExternalId: '1831',
      selectedFor: ['BBL four-team match merged from two source pages'],
    });

    expect(bbl.render).toHaveBeenCalledWith(['1830', '1831']);
  });

  it('renders a single source page for a BBL match with no paired row', async () => {
    await service.getRawSource(match('bbl'));

    expect(bbl.render).toHaveBeenCalledWith(['1830']);
  });

  it('renders the TP raw panel for a TP match', async () => {
    await expect(service.getRawSource(match('tp'))).resolves.toBe(
      '<p>tp raw</p>',
    );
    expect(tp.render).toHaveBeenCalledWith('344820');
    expect(bbl.render).not.toHaveBeenCalled();
  });

  it('renders the imported panel from the database for either source', async () => {
    await expect(service.getImportedView(match('tp'))).resolves.toBe(
      '<p>imported</p>',
    );
    expect(db.render).toHaveBeenCalledWith(match('tp'));
  });
});
