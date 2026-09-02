import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { BblMirrorReaderService } from './bbl-mirror-reader.service';
import { BblRawRaceIndexService } from './bbl-raw-race-index.service';

describe('BblRawRaceIndexService', () => {
  let service: BblRawRaceIndexService;
  let reader: ReturnType<typeof mock<BblMirrorReaderService>>;

  beforeEach(async () => {
    reader = mock<BblMirrorReaderService>();

    const moduleRef = await Test.createTestingModule({
      providers: [
        BblRawRaceIndexService,
        { provide: BblMirrorReaderService, useValue: reader },
      ],
    }).compile();
    service = moduleRef.get(BblRawRaceIndexService);
  });

  it('reads the race list page and exposes a race name', async () => {
    reader.readPage.mockResolvedValue(
      '<a name="5"></a><b>Dwarf Team</b><a name="6"></a><b>Elven Union Team</b>',
    );
    reader.listTeamPageFilenames.mockResolvedValue([]);

    const race = await service.raceFor('5');

    expect(race?.listName).toBe('Dwarf Team');
  });

  it('ignores non-numeric anchors in the race list', async () => {
    reader.readPage.mockResolvedValue(
      '<a name="top"></a><b>Ignore me</b><a name="5"></a><b>Dwarf Team</b>',
    );
    reader.listTeamPageFilenames.mockResolvedValue([]);

    const race = await service.raceFor('5');

    expect(race?.listName).toBe('Dwarf Team');
  });

  it('collects team pages naming the race', async () => {
    const teamPageHtml =
      '<table><tr><td>Race:</td><td><a href="default.asp?p=tl#5">Dwarf Team</a></td></tr></table>';
    reader.readPage.mockImplementation((filename: string) => {
      if (filename === 'default.asp?p=tl') {
        return Promise.resolve('<a name="5"></a><b>Dwarf Team</b>');
      }
      if (
        filename === 'default.asp?p=tm&t=ABC' ||
        filename === 'default.asp?p=tm&t=DEF'
      ) {
        return Promise.resolve(teamPageHtml);
      }
      return Promise.resolve(null);
    });
    reader.listTeamPageFilenames.mockResolvedValue([
      'default.asp?p=tm&t=ABC',
      'default.asp?p=tm&t=DEF',
    ]);

    const race = await service.raceFor('5');

    expect(race?.teamPageCount).toBe(2);
    expect(race?.teamCodes).toEqual(['ABC', 'DEF']);
    expect(race?.teamPageName).toBe('Dwarf Team');
  });

  it('normalises nbsp-prefixed team-page race cells', async () => {
    const teamPageHtml =
      '<table><tr><td>Race:</td><td>&nbsp;<a href="default.asp?p=tl#5">Dwarf&nbsp;Team</a></td></tr></table>';
    reader.readPage.mockImplementation((filename: string) => {
      if (filename === 'default.asp?p=tl') {
        return Promise.resolve(null);
      }
      if (filename === 'default.asp?p=tm&t=TEST') {
        return Promise.resolve(teamPageHtml);
      }
      return Promise.resolve(null);
    });
    reader.listTeamPageFilenames.mockResolvedValue(['default.asp?p=tm&t=TEST']);

    const race = await service.raceFor('5');

    expect(race?.teamPageName).toBe('Dwarf Team');
  });

  it('returns null for a bblId no source page mentions', async () => {
    reader.readPage.mockResolvedValue('<a name="5"></a><b>Dwarf Team</b>');
    reader.listTeamPageFilenames.mockResolvedValue([]);

    const race = await service.raceFor('999');

    expect(race).toBeNull();
  });

  it('returns an entry with listName null for a race known only from team pages', async () => {
    const teamPageHtml =
      '<table><tr><td>Race:</td><td><a href="default.asp?p=tl#5">Dwarf Team</a></td></tr></table>';
    reader.readPage.mockImplementation((filename: string) => {
      if (filename === 'default.asp?p=tl') {
        return Promise.resolve(null);
      }
      if (filename === 'default.asp?p=tm&t=ABC') {
        return Promise.resolve(teamPageHtml);
      }
      return Promise.resolve(null);
    });
    reader.listTeamPageFilenames.mockResolvedValue(['default.asp?p=tm&t=ABC']);

    const race = await service.raceFor('5');

    expect(race).not.toBeNull();
    expect(race?.listName).toBeNull();
    expect(race?.teamPageName).toBe('Dwarf Team');
  });

  it('scans the mirror exactly once across two raceFor calls', async () => {
    reader.readPage.mockImplementation((filename: string) => {
      if (filename === 'default.asp?p=tl') {
        return Promise.resolve(
          '<a name="5"></a><b>Dwarf Team</b><a name="6"></a><b>Elven Union Team</b>',
        );
      }
      return Promise.resolve(null);
    });
    reader.listTeamPageFilenames.mockResolvedValue([]);

    await service.raceFor('5');
    await service.raceFor('6');

    expect(reader.readPage).toHaveBeenCalledTimes(1);
    expect(reader.readPage).toHaveBeenCalledWith('default.asp?p=tl');
  });

  it('survives a missing race-list page', async () => {
    const teamPageHtml =
      '<table><tr><td>Race:</td><td><a href="default.asp?p=tl#5">Dwarf Team</a></td></tr></table>';
    reader.readPage.mockImplementation((filename: string) => {
      if (filename === 'default.asp?p=tl') {
        return Promise.resolve(null);
      }
      if (filename === 'default.asp?p=tm&t=ABC') {
        return Promise.resolve(teamPageHtml);
      }
      return Promise.resolve(null);
    });
    reader.listTeamPageFilenames.mockResolvedValue(['default.asp?p=tm&t=ABC']);

    const race = await service.raceFor('5');

    expect(race).not.toBeNull();
    expect(race?.listName).toBeNull();
  });
});
