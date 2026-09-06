import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { BblRawPlayerPageLoaderService } from '../source/bbl-raw-player-page-loader.service';
import { BblPlayerCharacteristicsRawRendererService } from './bbl-player-characteristics-raw-renderer.service';

function page(cells: string[]): string {
  const values = cells.map((cell) => `<td>${cell}</td>`).join('');
  return `
    <html><body>
      <table class="tblist">
        <tr class="trlisthead">
          <th><img><br>MA</th><th><img><br>ST</th><th><img><br>AG</th>
          <th><img><br>PA</th><th><img><br>AV</th><th>Skills</th>
        </tr>
        <tr>${values}<td>Block</td></tr>
      </table>
    </body></html>`;
}

describe('BblPlayerCharacteristicsRawRendererService', () => {
  let service: BblPlayerCharacteristicsRawRendererService;
  let loader: MockProxy<BblRawPlayerPageLoaderService>;

  beforeEach(async () => {
    loader = mock<BblRawPlayerPageLoaderService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        BblPlayerCharacteristicsRawRendererService,
        { provide: BblRawPlayerPageLoaderService, useValue: loader },
        HtmlService,
      ],
    }).compile();
    service = moduleRef.get(BblPlayerCharacteristicsRawRendererService);
  });

  it('renders the five values as the page shows them', async () => {
    loader.loadPlayerPage.mockResolvedValue(page(['5', '3', '3+', '4+', '8+']));

    const html = await service.render('1000');

    expect(html).toContain(
      '<th>MA</th><th>ST</th><th>AG</th><th>PA</th><th>AV</th>',
    );
    expect(html).toContain(
      '<td>5</td><td>3</td><td>3+</td><td>4+</td><td>8+</td>',
    );
  });

  it('renders a literal dash Passing cell as the none marker', async () => {
    loader.loadPlayerPage.mockResolvedValue(page(['6', '3', '3', '-', '9']));

    const html = await service.render('1000');

    expect(html).toContain(
      '<td>6</td><td>3</td><td>3</td><td>—</td><td>9</td>',
    );
  });

  it('renders a zero cell as the none marker rather than "0"', async () => {
    loader.loadPlayerPage.mockResolvedValue(page(['0', '0', '0', '0', '0']));

    const html = await service.render('1000');

    expect(html).toContain(
      '<td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>',
    );
  });

  it('notes a player whose page is not in the mirror', async () => {
    loader.loadPlayerPage.mockResolvedValue(null);

    const html = await service.render('1000');

    expect(html).toBe(
      '<p class="note">No BBL player page for pid 1000 in the downloaded mirror.</p>',
    );
  });

  it('skips a header row from an unrelated table before finding the real one', async () => {
    const unrelatedTable = `
      <table class="tblist">
        <tr class="trlisthead">
          <th>Skill</th><th>Category</th><th>Description</th>
        </tr>
        <tr><td>Block</td><td>General</td><td>...</td></tr>
      </table>`;
    loader.loadPlayerPage.mockResolvedValue(
      `<html><body>${unrelatedTable}${page(['5', '3', '3+', '4+', '8+'])}</body></html>`,
    );

    const html = await service.render('1000');

    expect(html).toContain(
      '<td>5</td><td>3</td><td>3+</td><td>4+</td><td>8+</td>',
    );
  });

  it('notes a page with no characteristics table at all', async () => {
    loader.loadPlayerPage.mockResolvedValue(
      '<html><body><h1>x</h1></body></html>',
    );

    const html = await service.render('1000');

    expect(html).toBe(
      '<p class="note">No characteristics line on the BBL player page for pid 1000.</p>',
    );
  });

  it('notes a characteristics row with fewer than five value cells', async () => {
    loader.loadPlayerPage.mockResolvedValue(page(['5', '3', '3']));

    const html = await service.render('1000');

    expect(html).toBe(
      '<p class="note">No characteristics line on the BBL player page for pid 1000.</p>',
    );
  });

  it('renders an unreadable cell verbatim so the reviewer sees what the page says', async () => {
    loader.loadPlayerPage.mockResolvedValue(
      page(['5', '3', '3+', 'n/a', '8+']),
    );

    const html = await service.render('1000');

    expect(html).toContain('<td>n/a</td>');
  });
});
