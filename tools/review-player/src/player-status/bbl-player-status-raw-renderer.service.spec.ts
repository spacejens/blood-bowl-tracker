import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { BblRawPlayerPageLoaderService } from '../source/bbl-raw-player-page-loader.service';
import { BblPlayerStatusRawRendererService } from './bbl-player-status-raw-renderer.service';

/**
 * A player page whose header `<b>` holds `headerIcons`, plus links to two
 * other (dead and retired) players elsewhere on the page.
 */
function page(headerIcons: string): string {
  return `<html><body>
<div style="text-align:center;padding-bottom:1px"><b>Grim Ironjaw ${headerIcons}</b></div>
<p>Killed by <a href="default.asp?p=pl&pid=77">Other <img src='gfx/cross.gif' alt='dead'></a>
and <a href="default.asp?p=pl&pid=78">Another <img src='gfx/retired.gif' alt='retired'></a></p>
</body></html>`;
}

describe('BblPlayerStatusRawRendererService', () => {
  let service: BblPlayerStatusRawRendererService;
  let loader: MockProxy<BblRawPlayerPageLoaderService>;

  beforeEach(async () => {
    loader = mock<BblRawPlayerPageLoaderService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        BblPlayerStatusRawRendererService,
        { provide: BblRawPlayerPageLoaderService, useValue: loader },
        // A pure formatter with its own tests; mocking it would leave the
        // generated markup unasserted.
        HtmlService,
      ],
    }).compile();
    service = moduleRef.get(BblPlayerStatusRawRendererService);
  });

  it("lists a header icon's alt text and image file name", async () => {
    loader.loadPlayerPage.mockResolvedValue(
      page(
        `<img src='https://bloodbowlleague.com/gfx/retire.png' alt='Temporarily retired'>`,
      ),
    );

    const html = await service.render('1000');

    expect(html).toContain('<th>Icon alt text</th><th>Image file</th>');
    expect(html).toContain('<td>Temporarily retired</td><td>retire.png</td>');
  });

  it('lists every header icon, in page order, with no precedence applied', async () => {
    loader.loadPlayerPage.mockResolvedValue(
      page(
        `<img src='gfx/retired.gif' alt='retired'><img src='gfx/cross.gif' alt='dead'>`,
      ),
    );

    const html = await service.render('1000');

    expect(html).toMatch(
      /<td>retired<\/td><td>retired\.gif<\/td>.*<td>dead<\/td><td>cross\.gif<\/td>/s,
    );
  });

  it('ignores icons outside the header block', async () => {
    loader.loadPlayerPage.mockResolvedValue(
      page(`<img src='gfx/cross.gif' alt='dead'>`),
    );

    const html = await service.render('1000');

    expect(html).not.toContain('retired.gif');
    expect(html.match(/cross\.gif/g)).toHaveLength(1);
  });

  it('does not list the bounty icon', async () => {
    loader.loadPlayerPage.mockResolvedValue(
      page(
        `<img src='gfx/bounty.gif' alt='Bounty of 50 kgp'><img src='gfx/cross.gif' alt='dead'>`,
      ),
    );

    const html = await service.render('1000');

    expect(html).not.toContain('Bounty');
    expect(html).toContain('<td>dead</td><td>cross.gif</td>');
  });

  it('says there is no status icon rather than calling the player active', async () => {
    loader.loadPlayerPage.mockResolvedValue(
      page(`<img src='gfx/bounty.gif' alt='Bounty of 50 kgp'>`),
    );

    const html = await service.render('1000');

    expect(html).toBe(
      '<p class="note">No status icon in the player header.</p>',
    );
  });

  it('notes a page with no player header block', async () => {
    loader.loadPlayerPage.mockResolvedValue(
      '<html><body><h1>X</h1></body></html>',
    );

    expect(await service.render('1000')).toBe(
      '<p class="note">No player header block on the BBL player page for pid 1000.</p>',
    );
  });

  it('notes a page that is not in the mirror', async () => {
    loader.loadPlayerPage.mockResolvedValue(null);

    expect(await service.render('4242')).toContain(
      'No BBL player page for pid 4242',
    );
  });
});
