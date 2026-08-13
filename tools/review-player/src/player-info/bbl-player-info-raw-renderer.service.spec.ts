import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { HtmlService } from '../shared/html.service';
import { BblRawPlayerPageLoaderService } from '../source/bbl-raw-player-page-loader.service';
import { BblPlayerInfoRawRendererService } from './bbl-player-info-raw-renderer.service';

const PAGE = `
<h1>Janhorgh</h1>
<a class="grey" href="default.asp?p=pt&typID=42">Hobgoblin Linemen</a>,<br>
<a href='default.asp?p=tm&t=zha'>Bull Whip Whippersnappers</a>
<table class="tblist">
 <tr class="trlisthead"><th><b>Achievements:</b></th></tr>
 <tr class="trborder"><td><table>
  <tr><td class="small">Interceptions:</td><td class="esmall">0</td><td></td></tr>
  <tr><td class="small"><a href="default.asp?p=mp&act=comp&pid=1000">Completions</a>:</td><td class="esmall">4</td><td></td></tr>
  <tr><td class="small"><a href="default.asp?p=mp&act=td&pid=1000">Touchdowns</a>:</td><td class="esmall">2</td><td></td></tr>
  <tr><td class="small"><a href="default.asp?p=mp&act=cas&pid=1000">Casualties</a>:</td><td class="esmall">1</td><td></td></tr>
  <tr><td class="small"><a href="default.asp?p=mp&act=mvp&pid=1000">MVP awards</a>:</td><td class="esmall">1</td><td></td></tr>
  <tr><td class="small">Unspent SPP:</td><td class="esmall">2</td>
      <td class="esmall"><span class="opaque50">(<a href='default.asp?p=mp&act=spp&pid=1000'>16</a>)</span></td></tr>
  <tr><td class="small">Fouls:</td><td class="esmall">0</td><td></td></tr>
 </table></td></tr>
</table>`;

async function makeService(page: string | null): Promise<{
  service: BblPlayerInfoRawRendererService;
  loader: MockProxy<BblRawPlayerPageLoaderService>;
}> {
  const loader = mock<BblRawPlayerPageLoaderService>();
  loader.loadPlayerPage.mockResolvedValue(page);
  const moduleRef = await Test.createTestingModule({
    providers: [
      BblPlayerInfoRawRendererService,
      { provide: BblRawPlayerPageLoaderService, useValue: loader },
      HtmlService,
    ],
  }).compile();
  return { service: moduleRef.get(BblPlayerInfoRawRendererService), loader };
}

describe('BblPlayerInfoRawRendererService', () => {
  it('renders the name, position and team from the page', async () => {
    const { service, loader } = await makeService(PAGE);

    const html = await service.render('1000');

    expect(loader.loadPlayerPage).toHaveBeenCalledWith('1000');
    expect(html).toContain('<td>Name</td><td>Janhorgh</td>');
    expect(html).toContain('<td>Position</td><td>Hobgoblin Linemen</td>');
    expect(html).toContain('<td>Team</td><td>Bull Whip Whippersnappers</td>');
  });

  it('renders every achievement the page lists', async () => {
    const { service } = await makeService(PAGE);

    const html = await service.render('1000');

    expect(html).toContain('<td>Touchdowns</td><td>2</td>');
    expect(html).toContain('<td>Casualties</td><td>1</td>');
    expect(html).toContain('<td>Completions</td><td>4</td>');
    expect(html).toContain('<td>MVP awards</td><td>1</td>');
    expect(html).toContain('<td>Interceptions</td><td>0</td>');
  });

  it('renders the career SPP total from the unspent-SPP row', async () => {
    const { service } = await makeService(PAGE);

    const html = await service.render('1000');

    expect(html).toContain('<td>Career SPP (BBL)</td><td>16</td>');
    expect(html).toContain('<td>Unspent SPP</td><td>2</td>');
  });

  it('ignores an unrelated act=spp link outside the achievements table', async () => {
    const pageWithEarlierLink = `
<h1>Janhorgh</h1>
<a href='default.asp?p=mp&act=spp&pid=9999'>999</a>
${PAGE}`;
    const { service } = await makeService(pageWithEarlierLink);

    const html = await service.render('1000');

    expect(html).toContain('<td>Career SPP (BBL)</td><td>16</td>');
    expect(html).not.toContain('<td>Career SPP (BBL)</td><td>999</td>');
  });

  it('notes a page that is not in the mirror', async () => {
    const { service } = await makeService(null);

    expect(await service.render('4242')).toBe(
      '<p class="note">No BBL player page for pid 4242 in the downloaded mirror.</p>',
    );
  });

  it('shows an em dash for a value the page does not carry', async () => {
    const { service } = await makeService('<h1>Nameless</h1>');

    const html = await service.render('7');

    expect(html).toContain('<td>Position</td><td>—</td>');
    expect(html).toContain('<td>Career SPP (BBL)</td><td>—</td>');
  });

  it('shows an em dash for the name when the page has no h1', async () => {
    const { service } = await makeService('<p>No name here</p>');

    const html = await service.render('7');

    expect(html).toContain('<td>Name</td><td>—</td>');
  });
});
