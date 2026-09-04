import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { BblMirrorReaderService } from './bbl-mirror-reader.service';
import { BblRawPositionPageService } from './bbl-raw-position-page.service';

const PAGE = `<h1>Dwarf Blitzer</h1>
<a href="default.asp?p=tl#5">Dwarf Team</a>
<a href="default.asp?p=tl#5">Dwarf Team</a>
<table><tr><td>MA</td><td>ST</td><td>AG</td><td>PA</td><td>AV</td></tr>
<tr><td>5</td><td>3</td><td>3+</td><td>-</td><td>9</td></tr></table>`;

describe('BblRawPositionPageService', () => {
  let service: BblRawPositionPageService;
  let reader: ReturnType<typeof mock<BblMirrorReaderService>>;

  beforeEach(async () => {
    reader = mock<BblMirrorReaderService>();

    const moduleRef = await Test.createTestingModule({
      providers: [
        BblRawPositionPageService,
        { provide: BblMirrorReaderService, useValue: reader },
      ],
    }).compile();
    service = moduleRef.get(BblRawPositionPageService);
  });

  it('addresses the page by its typID', async () => {
    reader.readPage.mockResolvedValue('<h1>Test</h1>');

    await service.positionFor('310');

    expect(reader.readPage).toHaveBeenCalledWith('default.asp?p=pt&typID=310');
  });

  it('extracts the h1 name', async () => {
    reader.readPage.mockResolvedValue('<h1>Dwarf Blitzer</h1>');

    const position = await service.positionFor('310');

    expect(position?.name).toBe('Dwarf Blitzer');
  });

  it('extracts every race link as bblId and name, deduplicated by id', async () => {
    reader.readPage.mockResolvedValue(
      `<h1>Position</h1>
<a href="default.asp?p=tl#5">Dwarf Team</a>
<a href="default.asp?p=tl#5">Dwarf Team</a>`,
    );

    const position = await service.positionFor('310');

    expect(position?.races).toEqual([{ bblId: '5', name: 'Dwarf Team' }]);
  });

  it('sets isStarPlayer when a td reads "None (star player)"', async () => {
    reader.readPage.mockResolvedValue(
      `<h1>Position</h1><table><tr><td>None (star player)</td></tr></table>`,
    );

    const position = await service.positionFor('310');

    expect(position?.isStarPlayer).toBe(true);
  });

  it('extracts MA/ST/AG/PA/AV from the row after the header row', async () => {
    reader.readPage.mockResolvedValue(PAGE);

    const position = await service.positionFor('310');

    expect(position?.characteristics).toEqual({
      move: '5',
      strength: '3',
      agility: '3+',
      passing: null,
      armour: '9',
    });
  });

  it('preserves a trailing plus on armour too', async () => {
    reader.readPage.mockResolvedValue(
      `<h1>Position</h1>
<table><tr><td>MA</td><td>ST</td><td>AG</td><td>PA</td><td>AV</td></tr>
<tr><td>5</td><td>3</td><td>3+</td><td>-</td><td>9+</td></tr></table>`,
    );

    const position = await service.positionFor('310');

    expect(position?.characteristics?.armour).toBe('9+');
  });

  it('returns null characteristics when a required cell is unparseable', async () => {
    reader.readPage.mockResolvedValue(
      `<h1>Position</h1>
<table><tr><td>MA</td><td>ST</td><td>AG</td><td>PA</td><td>AV</td></tr>
<tr><td>x</td><td>3</td><td>3+</td><td>-</td><td>9</td></tr></table>`,
    );

    const position = await service.positionFor('310');

    expect(position?.characteristics).toBeNull();
  });

  it('caches a parsed position and does not re-read the page on a second call', async () => {
    reader.readPage.mockResolvedValue(PAGE);

    await service.positionFor('310');
    const second = await service.positionFor('310');

    expect(second?.name).toBe('Dwarf Blitzer');
    expect(reader.readPage).toHaveBeenCalledTimes(1);
  });

  it('skips a link with no href attribute when collecting races', async () => {
    reader.readPage.mockResolvedValue(
      `<h1>Position</h1>
<a>No href here</a>
<a href="default.asp?p=tl#5">Dwarf Team</a>`,
    );

    const position = await service.positionFor('310');

    expect(position?.races).toEqual([{ bblId: '5', name: 'Dwarf Team' }]);
  });

  it('returns null characteristics when the row after the header has fewer than 5 cells', async () => {
    reader.readPage.mockResolvedValue(
      `<h1>Position</h1>
<table><tr><td>MA</td><td>ST</td><td>AG</td><td>PA</td><td>AV</td></tr>
<tr><td>5</td><td>3</td></tr></table>`,
    );

    const position = await service.positionFor('310');

    expect(position?.characteristics).toBeNull();
  });

  it('keeps the passing value verbatim when the cell is not a literal dash', async () => {
    reader.readPage.mockResolvedValue(
      `<h1>Position</h1>
<table><tr><td>MA</td><td>ST</td><td>AG</td><td>PA</td><td>AV</td></tr>
<tr><td>5</td><td>3</td><td>3+</td><td>6+</td><td>9</td></tr></table>`,
    );

    const position = await service.positionFor('310');

    expect(position?.characteristics?.passing).toBe('6+');
  });

  it('returns null characteristics when passing is present but unparseable', async () => {
    reader.readPage.mockResolvedValue(
      `<h1>Position</h1>
<table><tr><td>MA</td><td>ST</td><td>AG</td><td>PA</td><td>AV</td></tr>
<tr><td>5</td><td>3</td><td>3+</td><td>x</td><td>9</td></tr></table>`,
    );

    const position = await service.positionFor('310');

    expect(position?.characteristics).toBeNull();
  });

  it('returns null for a non-numeric typId without calling readPage', async () => {
    const position = await service.positionFor('abc');

    expect(position).toBeNull();
    expect(reader.readPage).not.toHaveBeenCalled();
  });

  it('returns null when the page is absent', async () => {
    reader.readPage.mockResolvedValue(null);

    const position = await service.positionFor('310');

    expect(position).toBeNull();
  });

  it('returns null when the page has no h1', async () => {
    reader.readPage.mockResolvedValue('<div>No heading</div>');

    const position = await service.positionFor('310');

    expect(position).toBeNull();
  });
});
