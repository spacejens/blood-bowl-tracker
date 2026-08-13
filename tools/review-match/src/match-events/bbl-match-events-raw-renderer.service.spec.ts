import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { BblRawPageLoaderService } from '../source/bbl-raw-page-loader.service';
import { BblMatchEventsRawRendererService } from './bbl-match-events-raw-renderer.service';

async function makeService(
  pages: string | null | Record<string, string | null>,
): Promise<BblMatchEventsRawRendererService> {
  const loader = mock<BblRawPageLoaderService>();
  loader.loadMatchPage.mockImplementation((externalId: string) =>
    Promise.resolve(
      typeof pages === 'object' && pages !== null
        ? (pages[externalId] ?? null)
        : pages,
    ),
  );
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

    const html = await service.render(['1830']);

    expect(html).toContain('<td>Betong Bengt</td>');
    expect(html).toContain('<td>TD Scorers</td>');
    expect(html).toContain('<td>Douglas Gran</td>');
  });

  it('falls back to generic Home/Away headers when no team header row is found', async () => {
    const service = await makeService(
      pageWith(
        '<tr><td>Betong Bengt</td><td>TD Scorers</td><td>Douglas Gran</td></tr>',
      ),
    );

    const html = await service.render(['1830']);

    expect(html).toContain('<th>Home</th>');
    expect(html).toContain('<th>Away</th>');
  });

  it("uses the two teams' names as the Home/Away column headers", async () => {
    // The page's team-name row: score summary sits in a nested table inside
    // the middle cell, exactly as BBL's real markup does.
    const service = await makeService(
      pageWith(
        '<tr>' +
          '<td><a href="default.asp?p=tm&t=gut"><img alt="Team badge"><br>' +
          '<b>Gutter Gunners</b></a><br></td>' +
          '<td><table><tr><td>4</td><td>TD score</td><td>2</td></tr></table></td>' +
          '<td><a href="default.asp?p=tm&t=fro"><img alt="Team badge"><br>' +
          '<b>Frostheart Raptors</b></a><br></td>' +
          '</tr>' +
          '<tr><td>Betong Bengt</td><td>TD Scorers</td><td>Douglas Gran</td></tr>',
      ),
    );

    const html = await service.render(['1830']);

    expect(html).toContain('<th>Gutter Gunners</th>');
    expect(html).toContain('<th>Frostheart Raptors</th>');
  });

  it('does not render the team header row itself as an event row', async () => {
    const service = await makeService(
      pageWith(
        '<tr>' +
          '<td><a href="default.asp?p=tm&t=gut"><b>Gutter Gunners</b></a></td>' +
          '<td><table><tr><td>4</td><td>TD score</td><td>2</td></tr></table></td>' +
          '<td><a href="default.asp?p=tm&t=fro"><b>Frostheart Raptors</b></a></td>' +
          '</tr>' +
          '<tr><td>Betong Bengt</td><td>TD Scorers</td><td>Douglas Gran</td></tr>',
      ),
    );

    const html = await service.render(['1830']);

    expect(html).not.toContain('<td>Gutter Gunners</td>');
    expect(html).not.toContain('<td>Frostheart Raptors</td>');
  });

  it("keeps the cell's <br> segmentation, rendered as a line break so the table stays narrow", async () => {
    const service = await makeService(
      pageWith(
        '<tr><td>Bengt<br>Gor Don</td><td>Badly Hurt&#39;ers</td><td></td></tr>',
      ),
    );

    const html = await service.render(['1830']);

    expect(html).toContain('<td>Bengt<br>Gor Don</td>');
  });

  it("shows each player link's pid and each image's alt text", async () => {
    const service = await makeService(
      pageWith(
        '<tr><td><a href="default.asp?p=pl&pid=3876">Betong Bengt</a>' +
          '<img src="gfx/cross.gif" alt="dead"></td>' +
          '<td>Casualties</td><td></td></tr>',
      ),
    );

    const html = await service.render(['1830']);

    expect(html).toContain('Betong Bengt');
    expect(html).toContain('pid=3876');
    expect(html).toContain('img alt: dead');
  });

  it('does not interpret the label — unknown labels are shown verbatim', async () => {
    const service = await makeService(
      pageWith('<tr><td>x</td><td>Totally New Label</td><td>y</td></tr>'),
    );

    const html = await service.render(['1830']);

    expect(html).toContain('<td>Totally New Label</td>');
  });

  it('skips rows that do not have exactly three cells', async () => {
    const service = await makeService(
      pageWith(
        '<tr><td colspan="3">&nbsp;</td></tr>' +
          '<tr><td>a</td><td>b</td><td>c</td></tr>',
      ),
    );

    const html = await service.render(['1830']);

    expect(html).toContain('<td>b</td>');
    expect(html).not.toContain('colspan');
  });

  it('renders a note when the raw page is not in the mirror', async () => {
    const service = await makeService(null);

    const html = await service.render(['9999']);

    expect(html).toBe(
      '<p class="note">Raw BBL page not found for match 9999 ' +
        '(expected a file named default.asp?p=m&amp;m=9999 in the configured ' +
        'BBL data directory).</p>',
    );
  });

  it('renders a note when the page has no tblist rows to show', async () => {
    const service = await makeService('<html><body>nothing</body></html>');

    const html = await service.render(['1830']);

    expect(html).toBe(
      '<p class="note">No table.tblist rows found on the raw BBL page.</p>',
    );
  });

  it('stacks both pages, each under its own source-match subheading, for a merged match', async () => {
    const service = await makeService({
      '1830': pageWith(
        '<tr><td>Betong Bengt</td><td>TD Scorers</td><td>Douglas Gran</td></tr>',
      ),
      '1831': pageWith(
        '<tr><td>Gor Don</td><td>Casualties</td><td>Sven Svensson</td></tr>',
      ),
    });

    const html = await service.render(['1830', '1831']);

    expect(html).toContain('<h5>Source match 1830</h5>');
    expect(html).toContain('<h5>Source match 1831</h5>');
    expect(html).toContain('<td>Betong Bengt</td>');
    expect(html).toContain('<td>Sven Svensson</td>');
    expect(html.indexOf('Betong Bengt')).toBeLessThan(
      html.indexOf('Source match 1831'),
    );
  });

  it('still renders the other page when one of a merged pair is missing', async () => {
    const service = await makeService({
      '1830': pageWith(
        '<tr><td>Betong Bengt</td><td>TD Scorers</td><td>Douglas Gran</td></tr>',
      ),
      '1831': null,
    });

    const html = await service.render(['1830', '1831']);

    expect(html).toContain('<td>Betong Bengt</td>');
    expect(html).toContain('Raw BBL page not found for match 1831');
  });

  it('adds no subheading for a single-page match', async () => {
    const service = await makeService(
      pageWith('<tr><td>a</td><td>b</td><td>c</td></tr>'),
    );

    const html = await service.render(['1830']);

    expect(html).not.toContain('<h5>');
  });
});
