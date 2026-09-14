import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { BblRawPlayerPageLoaderService } from '../source/bbl-raw-player-page-loader.service';
import { BblLastingInjuriesRawRendererService } from './bbl-lasting-injuries-raw-renderer.service';

function page(value: string): string {
  return `<html><body>
<table class="tblist" width="320"><tr height="25">
 <td width="94" class="small dark3"><a href="default.asp?p=mp&act=inj&pid=1000">Sustained Injuries:</a></td>
 <td class="small red3">${value}</td>
</tr></table>
</body></html>`;
}

describe('BblLastingInjuriesRawRendererService', () => {
  let service: BblLastingInjuriesRawRendererService;
  let loader: MockProxy<BblRawPlayerPageLoaderService>;

  beforeEach(async () => {
    loader = mock<BblRawPlayerPageLoaderService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        BblLastingInjuriesRawRendererService,
        { provide: BblRawPlayerPageLoaderService, useValue: loader },
        // A pure formatter with its own tests; mocking it would leave the
        // generated markup unasserted.
        HtmlService,
      ],
    }).compile();
    service = moduleRef.get(BblLastingInjuriesRawRendererService);
  });

  it("shows the page's own wording verbatim", async () => {
    loader.loadPlayerPage.mockResolvedValue(
      page(`-AV, &nbsp;<span color='#ffa0a0'>1</span> niggling inj.`),
    );

    const html = await service.render('1000');

    // Rendered as-is, not interpreted: the importer's reading of this text is
    // exactly what the report exists to check, so this panel must not
    // re-derive the same conclusion.
    expect(html).toContain('-AV, 1 niggling inj.');
  });

  it('keeps the miss-next-game sentence readable across the <br>', async () => {
    loader.loadPlayerPage.mockResolvedValue(
      page(
        `<span color='#ffa0a0'>1</span> niggling inj.<br>Must miss the next match due to injury`,
      ),
    );

    expect(await service.render('1000')).toContain(
      '1 niggling inj. Must miss the next match due to injury',
    );
  });

  it("shows BBL's own none", async () => {
    loader.loadPlayerPage.mockResolvedValue(
      page(`<span style='color:#808080'>none</span>`),
    );

    expect(await service.render('1000')).toContain('none');
  });

  it('notes a page that is not in the mirror', async () => {
    loader.loadPlayerPage.mockResolvedValue(null);

    expect(await service.render('4242')).toContain(
      'No BBL player page for pid 4242',
    );
  });

  it('notes a page with no sustained-injuries row', async () => {
    loader.loadPlayerPage.mockResolvedValue(
      '<html><body><h1>X</h1></body></html>',
    );

    expect(await service.render('1000')).toContain('No sustained-injuries row');
  });
});
