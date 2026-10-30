import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { BblRawPlayerPageLoaderService } from './bbl-raw-player-page-loader.service';
import { BblUnspentSppReaderService } from './bbl-unspent-spp-reader.service';

function page(valueCell: string, bracketCell: string): string {
  return `
<table class="tblist"><tr><td><table>
  <tr><td class="small">Touchdowns:</td><td class="esmall">2</td><td></td></tr>
  <tr>
   <td class="small">Unspent SPP:</td>
   <td class="esmall" style="color:#404040" align="center">${valueCell}</td>
   <td class="esmall">${bracketCell}</td>
  </tr>
</table></td></tr></table>`;
}

const LINKED_TOTAL = `<span class="opaque50">(<a href='default.asp?p=mp&act=spp&pid=1020'>34</a>)</span>`;

async function makeService(pageBody: string | null): Promise<{
  service: BblUnspentSppReaderService;
  loader: MockProxy<BblRawPlayerPageLoaderService>;
}> {
  const loader = mock<BblRawPlayerPageLoaderService>();
  loader.loadPlayerPage.mockResolvedValue(pageBody);
  const moduleRef = await Test.createTestingModule({
    providers: [
      BblUnspentSppReaderService,
      { provide: BblRawPlayerPageLoaderService, useValue: loader },
    ],
  }).compile();
  return { service: moduleRef.get(BblUnspentSppReaderService), loader };
}

describe('BblUnspentSppReaderService', () => {
  it('reads the reported figure and the linked career total', async () => {
    const { service, loader } = await makeService(page('4', LINKED_TOTAL));

    expect(await service.read('1020')).toEqual({ unspent: 4, careerTotal: 34 });
    expect(loader.loadPlayerPage).toHaveBeenCalledWith('1020');
  });

  it('keeps a negative reported figure as BBL prints it', async () => {
    const { service } = await makeService(page('-4', LINKED_TOTAL));

    expect(await service.read('1020')).toEqual({
      unspent: -4,
      careerTotal: 34,
    });
  });

  it('reads a bracketed total that carries no link', async () => {
    const { service } = await makeService(
      page('0', '<span class="opaque50">(0)</span>'),
    );

    expect(await service.read('1020')).toEqual({ unspent: 0, careerTotal: 0 });
  });

  it('gives null figures when the value is not a whole number', async () => {
    const { service } = await makeService(page('&nbsp;', ''));

    expect(await service.read('1020')).toEqual({
      unspent: null,
      careerTotal: null,
    });
  });

  it('gives null figures when the page has no Unspent SPP row', async () => {
    const { service } = await makeService('<table><tr><td>x</td></tr></table>');

    expect(await service.read('1020')).toEqual({
      unspent: null,
      careerTotal: null,
    });
  });

  it('returns null when the mirror has no page for the pid', async () => {
    const { service } = await makeService(null);

    expect(await service.read('1020')).toBeNull();
  });

  it('reads each page once per process', async () => {
    const { service, loader } = await makeService(page('4', LINKED_TOTAL));

    await service.read('1020');
    await service.read('1020');

    expect(loader.loadPlayerPage).toHaveBeenCalledTimes(1);
  });
});
