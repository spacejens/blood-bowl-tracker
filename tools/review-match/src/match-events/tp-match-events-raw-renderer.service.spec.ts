import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { HtmlService } from '../shared/html.service';
import { TpRawMatchFileLoaderService } from '../source/tp-raw-match-file-loader.service';
import { TpMatchEventsRawRendererService } from './tp-match-events-raw-renderer.service';
import { TpRawCodeLabelsService } from './tp-raw-code-labels.service';

async function makeService(
  file: object | null,
  loadError?: Error,
): Promise<TpMatchEventsRawRendererService> {
  const loader = mock<TpRawMatchFileLoaderService>();
  if (loadError) {
    loader.loadMatchFile.mockRejectedValue(loadError);
  } else {
    loader.loadMatchFile.mockResolvedValue(file);
  }
  const labels = mock<TpRawCodeLabelsService>();
  labels.describe.mockImplementation((code) => `code:${code}`);
  const moduleRef = await Test.createTestingModule({
    providers: [
      TpMatchEventsRawRendererService,
      { provide: TpRawMatchFileLoaderService, useValue: loader },
      { provide: TpRawCodeLabelsService, useValue: labels },
      HtmlService,
    ],
  }).compile();
  return moduleRef.get(TpMatchEventsRawRendererService);
}

describe('TpMatchEventsRawRendererService', () => {
  it('renders one row per raw event, showing the code through the label service', async () => {
    const service = await makeService({
      matchEvents: [
        {
          id: 7,
          matchEventType: 4,
          instant: '2024-05-01T10:00:00Z',
          lineUpId: 5,
        },
      ],
    });

    const html = await service.render('344820');

    expect(html).toContain('<td>code:4</td>');
    expect(html).toContain('<td>7</td>');
    expect(html).toContain('<td>2024-05-01T10:00:00Z</td>');
  });

  it('shows the remaining raw fields as JSON so nothing is silently dropped', async () => {
    const service = await makeService({
      matchEvents: [
        {
          id: 7,
          matchEventType: 8,
          instant: 'x',
          lineUpId: 5,
          extraData: { injuryType: 'Dead' },
        },
      ],
    });

    const html = await service.render('344820');

    expect(html).toContain('&quot;lineUpId&quot;:5');
    expect(html).toContain('&quot;injuryType&quot;:&quot;Dead&quot;');
  });

  it('truncates very long field payloads', async () => {
    const service = await makeService({
      matchEvents: [
        { id: 1, matchEventType: 4, instant: 'x', blob: 'y'.repeat(2000) },
      ],
    });

    const html = await service.render('344820');

    expect(html).toContain('…');
    expect(html.length).toBeLessThan(1500);
  });

  it('shows an entry without a numeric code rather than skipping it', async () => {
    const service = await makeService({ matchEvents: [{ id: 2 }] });

    const html = await service.render('344820');

    expect(html).toContain('<td>—</td>');
  });

  it('renders a note when the raw match file is not in the mirror', async () => {
    const service = await makeService(null);

    const html = await service.render('42');

    expect(html).toBe(
      '<p class="note">Raw TP match file not found for match 42 (expected ' +
        'match_42.json under the configured TP data directory).</p>',
    );
  });

  it('renders a note when the file has no matchEvents array', async () => {
    const service = await makeService({ matchId: 42 });

    const html = await service.render('42');

    expect(html).toBe(
      '<p class="note">The raw TP match file has no matchEvents array.</p>',
    );
  });

  it('renders a note when the file cannot be read or parsed', async () => {
    const service = await makeService(null, new Error('bad json'));

    const html = await service.render('42');

    expect(html).toBe(
      '<p class="note">Raw TP match file for match 42 could not be read: ' +
        'bad json</p>',
    );
  });
});
