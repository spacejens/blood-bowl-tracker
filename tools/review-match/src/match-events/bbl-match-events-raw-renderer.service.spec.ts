import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { HtmlService } from '../shared/html.service';
import { BblRawPageLoaderService } from '../source/bbl-raw-page-loader.service';
import { BblMatchEventsRawRendererService } from './bbl-match-events-raw-renderer.service';

async function makeService(
  page: string | null,
): Promise<BblMatchEventsRawRendererService> {
  const loader = mock<BblRawPageLoaderService>();
  loader.loadMatchPage.mockResolvedValue(page);
  const moduleRef = await Test.createTestingModule({
    providers: [
      BblMatchEventsRawRendererService,
      { provide: BblRawPageLoaderService, useValue: loader },
      HtmlService,
    ],
  }).compile();
  return moduleRef.get(BblMatchEventsRawRendererService);
}

const pageWith = (rows: string): string =>
  `<html><body><table class="tblist">${rows}</table></body></html>`;

describe('BblMatchEventsRawRendererService', () => {
  it('renders each three-cell row as home, label and away text', async () => {
    const service = await makeService(
      pageWith(
        '<tr><td>Betong Bengt</td><td>TD Scorers</td><td>Douglas Gran</td></tr>',
      ),
    );

    const html = await service.render('1830');

    expect(html).toContain('<td>Betong Bengt</td>');
    expect(html).toContain('<td>TD Scorers</td>');
    expect(html).toContain('<td>Douglas Gran</td>');
  });

  it("keeps the cell's <br> segmentation, which separates participants", async () => {
    const service = await makeService(
      pageWith(
        '<tr><td>Bengt<br>Gor Don</td><td>Badly Hurt&#39;ers</td><td></td></tr>',
      ),
    );

    const html = await service.render('1830');

    expect(html).toContain('<td>Bengt | Gor Don</td>');
  });

  it("shows each player link's pid and each image's alt text", async () => {
    const service = await makeService(
      pageWith(
        '<tr><td><a href="default.asp?p=pl&pid=3876">Betong Bengt</a>' +
          '<img src="gfx/cross.gif" alt="dead"></td>' +
          '<td>Casualties</td><td></td></tr>',
      ),
    );

    const html = await service.render('1830');

    expect(html).toContain('Betong Bengt');
    expect(html).toContain('pid=3876');
    expect(html).toContain('img alt: dead');
  });

  it('does not interpret the label — unknown labels are shown verbatim', async () => {
    const service = await makeService(
      pageWith('<tr><td>x</td><td>Totally New Label</td><td>y</td></tr>'),
    );

    const html = await service.render('1830');

    expect(html).toContain('<td>Totally New Label</td>');
  });

  it('skips rows that do not have exactly three cells', async () => {
    const service = await makeService(
      pageWith(
        '<tr><td colspan="3">&nbsp;</td></tr>' +
          '<tr><td>a</td><td>b</td><td>c</td></tr>',
      ),
    );

    const html = await service.render('1830');

    expect(html).toContain('<td>b</td>');
    expect(html).not.toContain('colspan');
  });

  it('renders a note when the raw page is not in the mirror', async () => {
    const service = await makeService(null);

    const html = await service.render('9999');

    expect(html).toBe(
      '<p class="note">Raw BBL page not found for match 9999 ' +
        '(expected a file named default.asp?p=m&amp;m=9999 in the configured ' +
        'BBL data directory).</p>',
    );
  });

  it('renders a note when the page has no tblist rows to show', async () => {
    const service = await makeService('<html><body>nothing</body></html>');

    const html = await service.render('1830');

    expect(html).toBe(
      '<p class="note">No table.tblist rows found on the raw BBL page.</p>',
    );
  });
});
