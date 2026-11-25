import {
  TpFileNameService,
  TpFilesReaderService,
} from '@blood-bowl-tracker/read-tp-files';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { EraDataConfig } from '../eras/era-data-config.service';
import { EraDataConfigService } from '../eras/era-data-config.service';
import { SourceConfigService } from './source-config.service';
import type { TpSourceFile } from './tp-source-reader';
import { TpSourceReader } from './tp-source-reader';

const DATA_DIR = '/data';

const fourthEra: EraDataConfig = {
  name: 'Fourth era',
  dataSubdir: 'fourth-era',
  rulesSets: ['BB2020'],
  startDate: '2020-11-28',
};

async function makeReader(eras: EraDataConfig[] = [fourthEra]): Promise<{
  reader: TpSourceReader;
  tpFiles: MockProxy<TpFilesReaderService>;
}> {
  const sourceConfig = mock<SourceConfigService>();
  sourceConfig.getDataDir.mockReturnValue(DATA_DIR);
  const eraConfig = mock<EraDataConfigService>();
  eraConfig.getEras.mockReturnValue(eras);
  const tpFiles = mock<TpFilesReaderService>();
  const moduleRef = await Test.createTestingModule({
    providers: [
      TpSourceReader,
      { provide: SourceConfigService, useValue: sourceConfig },
      { provide: EraDataConfigService, useValue: eraConfig },
      { provide: TpFilesReaderService, useValue: tpFiles },
      TpFileNameService,
    ],
  }).compile();
  return { reader: moduleRef.get(TpSourceReader), tpFiles };
}

/**
 * Canned layout: one era directory `eraName` holding one competition, whose
 * files (filename to parsed body) are listed in the order given and read back
 * by filename.
 */
function stubLayout(
  tpFiles: MockProxy<TpFilesReaderService>,
  layout: { eraName: string; files: Record<string, unknown> },
): void {
  tpFiles.listEras.mockResolvedValue([layout.eraName]);
  tpFiles.listCompetitions.mockResolvedValue(['chaos-cup-8']);
  tpFiles.listFiles.mockResolvedValue(Object.keys(layout.files));
  tpFiles.readJson.mockImplementation((_dataDir, segments) =>
    Promise.resolve({
      path: segments.join('/'),
      content: layout.files[segments[2]],
    }),
  );
}

async function collect(
  iterable: AsyncIterable<TpSourceFile>,
): Promise<TpSourceFile[]> {
  const files: TpSourceFile[] = [];
  for await (const file of iterable) {
    files.push(file);
  }
  return files;
}

describe('TpSourceReader', () => {
  it('yields one entry per JSON file across nested era/competition dirs', async () => {
    const { reader, tpFiles } = await makeReader();
    stubLayout(tpFiles, {
      eraName: 'fourth-era',
      files: {
        'match_566088.json': { id: 566088 },
        'rosters_163386.json': { id: 163386 },
      },
    });

    const files = await collect(reader.files());

    expect(files).toHaveLength(2);
    const byName = new Map(files.map((f) => [f.filename, f]));
    expect(byName.get('match_566088.json')).toEqual({
      era: 'Fourth era',
      competition: 'chaos-cup-8',
      type: 'match',
      filename: 'match_566088.json',
      content: { id: 566088 },
    });
    expect(byName.get('rosters_163386.json')?.type).toBe('rosters');
    expect(tpFiles.listCompetitions).toHaveBeenCalledWith(
      DATA_DIR,
      'fourth-era',
    );
    expect(tpFiles.listFiles).toHaveBeenCalledWith(
      DATA_DIR,
      'fourth-era',
      'chaos-cup-8',
    );
    expect(tpFiles.readJson).toHaveBeenCalledWith(DATA_DIR, [
      'fourth-era',
      'chaos-cup-8',
      'match_566088.json',
    ]);
  });

  it('uses the configured era name, not the dataSubdir, as the era field', async () => {
    const { reader, tpFiles } = await makeReader();
    stubLayout(tpFiles, {
      eraName: 'fourth-era',
      files: { 'match_1.json': {} },
    });

    const [file] = await collect(reader.files());

    expect(file.era).toBe('Fourth era');
  });

  it('classifies a file outside the known kinds as other', async () => {
    const { reader, tpFiles } = await makeReader();
    stubLayout(tpFiles, {
      eraName: 'fourth-era',
      files: { 'standings.json': {} },
    });

    const [file] = await collect(reader.files());

    expect(file.type).toBe('other');
  });

  it('yields only the requested file type, without reading the others', async () => {
    const { reader, tpFiles } = await makeReader();
    stubLayout(tpFiles, {
      eraName: 'fourth-era',
      files: {
        'tournament_x.json': {},
        'match_1.json': {},
        'awards_x_awards.json': {},
      },
    });

    const seen = (await collect(reader.filesOfType('awards'))).map(
      (f) => f.filename,
    );

    expect(seen).toEqual(['awards_x_awards.json']);
    expect(tpFiles.readJson).toHaveBeenCalledTimes(1);
  });

  it('yields files matching any of a list of requested types', async () => {
    const { reader, tpFiles } = await makeReader();
    stubLayout(tpFiles, {
      eraName: 'fourth-era',
      files: {
        'tournament_x.json': {},
        'match_1.json': {},
        'rosters_1.json': {},
        'awards_x_awards.json': {},
      },
    });

    const seen = (await collect(reader.filesOfType(['rosters', 'match']))).map(
      (f) => f.filename,
    );

    expect(seen.sort()).toEqual(['match_1.json', 'rosters_1.json']);
  });

  it('still yields every file when unfiltered', async () => {
    const { reader, tpFiles } = await makeReader();
    stubLayout(tpFiles, {
      eraName: 'fourth-era',
      files: {
        'tournament_x.json': {},
        'match_1.json': {},
        'awards_x_awards.json': {},
      },
    });

    const files = await collect(reader.files());

    expect(files).toHaveLength(3);
  });

  it('skips a file that disappears between listing and reading', async () => {
    const { reader, tpFiles } = await makeReader();
    tpFiles.listEras.mockResolvedValue(['fourth-era']);
    tpFiles.listCompetitions.mockResolvedValue(['chaos-cup-8']);
    tpFiles.listFiles.mockResolvedValue(['match_1.json']);
    tpFiles.readJson.mockResolvedValue(null);

    expect(await collect(reader.files())).toEqual([]);
  });

  it('throws a friendly error when an era directory is missing', async () => {
    const { reader, tpFiles } = await makeReader();
    tpFiles.listEras.mockResolvedValue([]);

    await expect(collect(reader.files())).rejects.toThrow(
      /Era data directory not found.*Fourth era/,
    );
  });

  it('names the directory and era when an era directory is missing', async () => {
    const { reader, tpFiles } = await makeReader();
    tpFiles.listEras.mockResolvedValue(['third-era']);

    await expect(collect(reader.files())).rejects.toThrow(
      'Era data directory not found: /data/fourth-era (configured for era "Fourth era").',
    );
  });

  it('only walks the era directories it lists, never the teams directory', async () => {
    const { reader, tpFiles } = await makeReader();
    stubLayout(tpFiles, {
      eraName: 'fourth-era',
      files: { 'match_1.json': {} },
    });

    const files = await collect(reader.files());

    expect(files.map((f) => f.filename)).toEqual(['match_1.json']);
    expect(tpFiles.listTeamsRulesSets).not.toHaveBeenCalled();
    expect(tpFiles.listTeamsFiles).not.toHaveBeenCalled();
    expect(tpFiles.listCompetitions).toHaveBeenCalledTimes(1);
  });

  it('rejects with the reader error when a JSON file is malformed', async () => {
    const { reader, tpFiles } = await makeReader();
    tpFiles.listEras.mockResolvedValue(['fourth-era']);
    tpFiles.listCompetitions.mockResolvedValue(['chaos-cup-8']);
    tpFiles.listFiles.mockResolvedValue(['match_1.json']);
    tpFiles.readJson.mockRejectedValue(
      new Error(
        'Failed to parse TP file /data/fourth-era/chaos-cup-8/match_1.json: bad',
      ),
    );

    await expect(collect(reader.files())).rejects.toThrow(
      '/data/fourth-era/chaos-cup-8/match_1.json',
    );
  });

  it('types a tournament variant file as tournament but not a base file', async () => {
    const { reader, tpFiles } = await makeReader();
    stubLayout(tpFiles, {
      eraName: 'fourth-era',
      files: { 'tournament_x_coach-stats.json': {} },
    });

    const [file] = await collect(reader.files());

    expect(file.type).toBe('tournament');
    expect(reader.isBaseTournamentFile(file.filename)).toBe(false);
  });

  it.each([
    ['./fourth-era', DATA_DIR],
    ['archive/fourth-era', '/data/archive'],
  ])(
    'resolves a configured dataSubdir of %s relative to the data dir',
    async (dataSubdir, parent) => {
      const { reader, tpFiles } = await makeReader([
        { ...fourthEra, dataSubdir },
      ]);
      stubLayout(tpFiles, {
        eraName: 'fourth-era',
        files: { 'match_1.json': {} },
      });

      const files = await collect(reader.files());

      expect(files.map((f) => f.filename)).toEqual(['match_1.json']);
      expect(tpFiles.listEras).toHaveBeenCalledWith(parent);
      expect(tpFiles.readJson).toHaveBeenCalledWith(parent, [
        'fourth-era',
        'chaos-cup-8',
        'match_1.json',
      ]);
    },
  );

  it('names the resolved path when a nested era directory is missing', async () => {
    const { reader, tpFiles } = await makeReader([
      { ...fourthEra, dataSubdir: 'archive/fourth-era' },
    ]);
    tpFiles.listEras.mockResolvedValue([]);

    await expect(collect(reader.files())).rejects.toThrow(
      'Era data directory not found: /data/archive/fourth-era (configured for era "Fourth era").',
    );
  });
});

describe('isBaseTournamentFile', () => {
  it('accepts a base tournament file with a hyphenated slug', async () => {
    const { reader } = await makeReader([]);

    expect(reader.isBaseTournamentFile('tournament_chaos-cup-8.json')).toBe(
      true,
    );
  });

  it('rejects a tournament variant file carrying a second underscore', async () => {
    const { reader } = await makeReader([]);

    expect(
      reader.isBaseTournamentFile('tournament_chaos-cup-8_coach-stats.json'),
    ).toBe(false);
    expect(reader.isBaseTournamentFile('tournament_a_team-stats.json')).toBe(
      false,
    );
  });

  it('rejects non-tournament filenames', async () => {
    const { reader } = await makeReader([]);

    expect(reader.isBaseTournamentFile('match_566088.json')).toBe(false);
    expect(reader.isBaseTournamentFile('rosters_1.json')).toBe(false);
  });
});
