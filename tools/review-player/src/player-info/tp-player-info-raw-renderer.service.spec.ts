import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { HtmlService } from '../shared/html.service';
import type { TpRawPlayerAggregate } from '../source/tp-raw-player-index.service';
import { TpRawPlayerIndexService } from '../source/tp-raw-player-index.service';
import { TpPlayerEventLabelsService } from './tp-player-event-labels.service';
import { TpPlayerInfoRawRendererService } from './tp-player-info-raw-renderer.service';

const aggregate: TpRawPlayerAggregate = {
  lineUpId: 2477481,
  name: 'Hubert Hårdråde',
  position: 'Flesh Golem',
  totalStarPlayerPoints: 12,
  starPointsFromEvents: 10,
  eventCounts: new Map([
    [4, 2],
    [7, 1],
  ]),
  matchCount: 2,
};

async function makeService(found: TpRawPlayerAggregate | null): Promise<{
  service: TpPlayerInfoRawRendererService;
  index: MockProxy<TpRawPlayerIndexService>;
}> {
  const index = mock<TpRawPlayerIndexService>();
  index.aggregateFor.mockResolvedValue(found);
  const labels = mock<TpPlayerEventLabelsService>();
  labels.describe.mockImplementation((code: number) => `${code} (label)`);
  const moduleRef = await Test.createTestingModule({
    providers: [
      TpPlayerInfoRawRendererService,
      { provide: TpRawPlayerIndexService, useValue: index },
      { provide: TpPlayerEventLabelsService, useValue: labels },
      HtmlService,
    ],
  }).compile();
  return { service: moduleRef.get(TpPlayerInfoRawRendererService), index };
}

describe('TpPlayerInfoRawRendererService', () => {
  it('renders the identity TP reports for the player', async () => {
    const { service, index } = await makeService(aggregate);

    const html = await service.render('2477481');

    expect(index.aggregateFor).toHaveBeenCalledWith('2477481');
    expect(html).toContain('<td>Name</td><td>Hubert Hårdråde</td>');
    expect(html).toContain('<td>Position</td><td>Flesh Golem</td>');
  });

  it('renders both TP SPP figures and the match count', async () => {
    const { service } = await makeService(aggregate);

    const html = await service.render('2477481');

    expect(html).toContain('<td>Reported total SPP (TP)</td><td>12</td>');
    expect(html).toContain(
      '<td>SPP summed from raw match events</td><td>10</td>',
    );
    expect(html).toContain('<td>Matches appeared in</td><td>2</td>');
  });

  it('lists each attributed event code with its count', async () => {
    const { service } = await makeService(aggregate);

    const html = await service.render('2477481');

    expect(html).toContain('<td>Events: 4 (label)</td><td>2</td>');
    expect(html).toContain('<td>Events: 7 (label)</td><td>1</td>');
  });

  it('shows an em dash when TP reports no total for the player', async () => {
    const { service } = await makeService({
      ...aggregate,
      totalStarPlayerPoints: null,
    });

    expect(await service.render('2477481')).toContain(
      '<td>Reported total SPP (TP)</td><td>—</td>',
    );
  });

  it('notes a player who appears in no downloaded TP match file', async () => {
    const { service } = await makeService(null);

    expect(await service.render('9999999')).toBe(
      '<p class="note">Line-up id 9999999 appears in no downloaded TP match file.</p>',
    );
  });
});
