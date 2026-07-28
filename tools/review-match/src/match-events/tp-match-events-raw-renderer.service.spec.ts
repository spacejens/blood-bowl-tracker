import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { HtmlService } from '../shared/html.service';
import { TpRawMatchFileLoaderService } from '../source/tp-raw-match-file-loader.service';
import { TpRawPlayerNameResolverService } from '../source/tp-raw-player-name-resolver.service';
import { TpMatchEventsRawRendererService } from './tp-match-events-raw-renderer.service';
import { TpRawCodeLabelsService } from './tp-raw-code-labels.service';
import { TpRawWeatherLabelsService } from './tp-raw-weather-labels.service';

/**
 * The name map the mocked resolver hands back. Its contents never matter —
 * `nameFor` is stubbed — but its identity does: it proves the renderer builds
 * the map once and threads that same map into every row.
 */
const NAMES = new Map<number, string>([[1, 'ignored']]);

interface Mocks {
  loader: MockProxy<TpRawMatchFileLoaderService>;
  labels: MockProxy<TpRawCodeLabelsService>;
  weather: MockProxy<TpRawWeatherLabelsService>;
  players: MockProxy<TpRawPlayerNameResolverService>;
}

function makeMocks(file: object | null, loadError?: Error): Mocks {
  const loader = mock<TpRawMatchFileLoaderService>();
  if (loadError) {
    loader.loadMatchFile.mockRejectedValue(loadError);
  } else {
    loader.loadMatchFile.mockResolvedValue(file);
  }
  const labels = mock<TpRawCodeLabelsService>();
  labels.describe.mockImplementation((code) => `code:${code}`);
  const weather = mock<TpRawWeatherLabelsService>();
  weather.describe.mockImplementation((table, code) => `w:${table}:${code}`);
  const players = mock<TpRawPlayerNameResolverService>();
  players.namesFrom.mockReturnValue(NAMES);
  players.nameFor.mockImplementation((_names, id) => `player:${id}`);
  return { loader, labels, weather, players };
}

async function makeServiceWith(
  mocks: Mocks,
): Promise<TpMatchEventsRawRendererService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      TpMatchEventsRawRendererService,
      { provide: TpRawMatchFileLoaderService, useValue: mocks.loader },
      { provide: TpRawCodeLabelsService, useValue: mocks.labels },
      { provide: TpRawWeatherLabelsService, useValue: mocks.weather },
      { provide: TpRawPlayerNameResolverService, useValue: mocks.players },
      HtmlService,
    ],
  }).compile();
  return moduleRef.get(TpMatchEventsRawRendererService);
}

async function makeService(
  file: object | null,
  loadError?: Error,
): Promise<TpMatchEventsRawRendererService> {
  return makeServiceWith(makeMocks(file, loadError));
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
  });

  it('heads the table with the reviewable columns and no instant column', async () => {
    const service = await makeService({ matchEvents: [{ id: 1 }] });

    const html = await service.render('344820');

    expect(html).toContain(
      '<tr><th>#</th><th>Code</th><th>Event id</th><th>Summary</th>' +
        '<th>Other raw fields</th></tr>',
    );
  });

  it('summarises an event carrying a lineUpId with the resolved player name', async () => {
    const mocks = makeMocks({
      matchEvents: [{ id: 7, matchEventType: 31, instant: 'x', lineUpId: 5 }],
    });
    const service = await makeServiceWith(mocks);

    const html = await service.render('344820');

    expect(html).toContain('<td>Player: player:5</td>');
    expect(mocks.players.nameFor).toHaveBeenCalledWith(NAMES, 5);
  });

  it('appends the injury outcome for a code-8 (injury) event', async () => {
    const service = await makeService({
      matchEvents: [
        {
          id: 7,
          matchEventType: 8,
          instant: 'x',
          lineUpId: 5,
          injuryType: 'Dead',
        },
      ],
    });

    const html = await service.render('344820');

    expect(html).toContain('<td>Player: player:5 (Dead)</td>');
  });

  it('does not append an injury outcome for a non-injury event', async () => {
    const service = await makeService({
      matchEvents: [
        {
          id: 7,
          matchEventType: 4,
          instant: 'x',
          lineUpId: 5,
          injuryType: 'Dead',
        },
      ],
    });

    const html = await service.render('344820');

    expect(html).toContain('<td>Player: player:5</td>');
  });

  it('builds the name map once from the loaded file and reuses it per row', async () => {
    const file = {
      matchEvents: [
        { id: 1, matchEventType: 4, lineUpId: 5 },
        { id: 2, matchEventType: 4, lineUpId: 6 },
      ],
    };
    const mocks = makeMocks(file);
    const service = await makeServiceWith(mocks);

    await service.render('344820');

    expect(mocks.players.namesFrom).toHaveBeenCalledTimes(1);
    expect(mocks.players.namesFrom).toHaveBeenCalledWith(file);
    expect(mocks.players.nameFor).toHaveBeenNthCalledWith(1, NAMES, 5);
    expect(mocks.players.nameFor).toHaveBeenNthCalledWith(2, NAMES, 6);
  });

  it('summarises a weather event through the table-aware weather labels', async () => {
    const mocks = makeMocks({
      matchEvents: [
        {
          id: 9,
          matchEventType: 10,
          instant: 'x',
          extraData: { weatherType: 40, weatherTable: 13 },
        },
      ],
    });
    const service = await makeServiceWith(mocks);

    const html = await service.render('344820');

    expect(html).toContain('<td>w:13:40</td>');
    expect(mocks.weather.describe).toHaveBeenCalledWith(13, 40);
  });

  it('treats a weather event with no weatherTable as the classic table 0', async () => {
    const mocks = makeMocks({
      matchEvents: [
        {
          id: 9,
          matchEventType: 10,
          instant: 'x',
          extraData: { weatherType: 30 },
        },
      ],
    });
    const service = await makeServiceWith(mocks);

    await service.render('344820');

    expect(mocks.weather.describe).toHaveBeenCalledWith(0, 30);
  });

  it('shows no summary for a weather event with no numeric weather code', async () => {
    const mocks = makeMocks({
      matchEvents: [{ id: 9, matchEventType: 10, instant: 'x', extraData: {} }],
    });
    const service = await makeServiceWith(mocks);

    const html = await service.render('344820');

    expect(html).toContain('<td>—</td>');
    expect(mocks.weather.describe).not.toHaveBeenCalled();
  });

  it('summarises an inducements event with the induced star players', async () => {
    const service = await makeService({
      matchEvents: [
        {
          id: 11,
          matchEventType: 11,
          instant: 'x',
          extraData: {
            totalCost: 250000,
            starPlayers: [{ name: 'Griff Oberwald' }, { name: 'Morg n Thorg' }],
          },
        },
      ],
    });

    const html = await service.render('344820');

    expect(html).toContain('<td>Griff Oberwald, Morg n Thorg</td>');
  });

  it('shows the treasury spend alongside the induced star players', async () => {
    const service = await makeService({
      matchEvents: [
        {
          id: 11,
          matchEventType: 11,
          instant: 'x',
          extraData: {
            totalCost: 250000,
            starPlayers: [{ name: 'Griff Oberwald' }],
            fromTreasury: 50000,
          },
        },
      ],
    });

    const html = await service.render('344820');

    expect(html).toContain('<td>Griff Oberwald; Treasury: 50000</td>');
  });

  it('shows the treasury spend alone when no star players were induced', async () => {
    const service = await makeService({
      matchEvents: [
        {
          id: 11,
          matchEventType: 11,
          instant: 'x',
          extraData: {
            totalCost: 25000,
            starPlayers: [],
            fromTreasury: 25000,
          },
        },
      ],
    });

    const html = await service.render('344820');

    expect(html).toContain('<td>Treasury: 25000</td>');
  });

  it('shows no summary for an inducements event with no starPlayers field at all', async () => {
    const service = await makeService({
      matchEvents: [
        {
          id: 11,
          matchEventType: 11,
          instant: 'x',
          extraData: { totalCost: 100 },
        },
      ],
    });

    const html = await service.render('344820');

    expect(html).toContain('<td>—</td>');
  });

  it('shows no summary for an inducements event that induced no star players', async () => {
    const service = await makeService({
      matchEvents: [
        {
          id: 11,
          matchEventType: 11,
          instant: 'x',
          extraData: { totalCost: 0, starPlayers: [] },
        },
      ],
    });

    const html = await service.render('344820');

    expect(html).toContain('<td>—</td>');
  });

  it('drops non-object star-player entries and ones with no string name', async () => {
    const service = await makeService({
      matchEvents: [
        {
          id: 11,
          matchEventType: 11,
          instant: 'x',
          extraData: { starPlayers: [{ name: 'A' }, 5, {}, null] },
        },
      ],
    });

    const html = await service.render('344820');

    expect(html).toContain('<td>A</td>');
  });

  it('falls back to no summary when extraData itself is not an object', async () => {
    const service = await makeService({
      matchEvents: [
        { id: 9, matchEventType: 10, instant: 'x', extraData: 'not an object' },
      ],
    });

    const html = await service.render('344820');

    expect(html).toContain('<td>—</td>');
  });

  it('shows no summary for an event kind it has nothing to add to', async () => {
    const service = await makeService({
      matchEvents: [
        {
          id: 12,
          matchEventType: 12,
          instant: 'x',
          extraData: { localWinnings: 60000, visitorWinnings: 40000 },
        },
      ],
    });

    const html = await service.render('344820');

    expect(html).toContain('<td>—</td>');
  });

  it('summarises a dedicated fans event with both modifiers', async () => {
    const service = await makeService({
      matchEvents: [
        {
          id: 13,
          matchEventType: 26,
          instant: 'x',
          extraData: {
            dedicatedFansModifierLocal: 1,
            dedicatedFansModifierVisitor: -1,
          },
        },
      ],
    });

    const html = await service.render('344820');

    expect(html).toContain('<td>Dedicated fans: local +1, visitor -1</td>');
  });

  it('summarises a dedicated fans event when only one modifier is present', async () => {
    const service = await makeService({
      matchEvents: [
        {
          id: 13,
          matchEventType: 26,
          instant: 'x',
          extraData: { dedicatedFansModifierLocal: 2 },
        },
      ],
    });

    const html = await service.render('344820');

    expect(html).toContain('<td>Dedicated fans: local +2, visitor ?</td>');
  });

  it('shows no summary for a dedicated fans event with neither modifier present', async () => {
    const service = await makeService({
      matchEvents: [
        { id: 13, matchEventType: 26, instant: 'x', extraData: {} },
      ],
    });

    const html = await service.render('344820');

    expect(html).toContain('<td>—</td>');
  });

  it('folds the remaining raw fields into a collapsed details block', async () => {
    const service = await makeService({
      matchEvents: [
        {
          id: 7,
          matchEventType: 8,
          instant: 'x',
          lineUpId: 5,
          injuryType: 'Dead',
        },
      ],
    });

    const html = await service.render('344820');

    expect(html).toContain('<details><summary>expand</summary>');
    expect(html).not.toContain('<details open');
    expect(html).toContain('<pre class="cell-pre">');
    expect(html).toContain('&quot;lineUpId&quot;: 5');
    expect(html).toContain('&quot;injuryType&quot;: &quot;Dead&quot;');
  });

  it('leaves an event with no other raw fields unwrapped, with nothing to expand', async () => {
    const service = await makeService({
      matchEvents: [{ id: 7, matchEventType: 4 }],
    });

    const html = await service.render('344820');

    expect(html).not.toContain('<details>');
  });

  it('folds instant into the "Other raw fields" JSON rather than dropping it', async () => {
    const service = await makeService({
      matchEvents: [
        { id: 7, matchEventType: 4, instant: '2024-05-01T10:00:00Z' },
      ],
    });

    const html = await service.render('344820');

    expect(html).toContain('&quot;instant&quot;:');
  });

  it('truncates very long field payloads', async () => {
    const service = await makeService({
      matchEvents: [
        { id: 1, matchEventType: 4, instant: 'x', blob: 'y'.repeat(2000) },
      ],
    });

    const html = await service.render('344820');

    expect(html).toContain('…');
    expect(html.length).toBeLessThan(1600);
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
