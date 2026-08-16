import type { ImportError } from '@blood-bowl-tracker/import';
import { ImportResultService } from '@blood-bowl-tracker/import';
import type { TpAward } from '@blood-bowl-tracker/parse-tp';
import { AwardsParserService } from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { mockImportResultService } from '../import-package.test-helpers';
import type { TpSourceFile } from '../source/tp-source-reader';
import { TpSourceReader } from '../source/tp-source-reader';
import { TpAwardsReaderService } from './tp-awards-reader.service';

async function makeService(
  files: TpSourceFile[],
  parser: MockProxy<AwardsParserService> = mock<AwardsParserService>(),
) {
  const sourceReader = mock<TpSourceReader>();
  sourceReader.filesOfType.mockImplementation(async function* () {
    await Promise.resolve();
    yield* files;
  });
  const importResults = mockImportResultService();
  const moduleRef = await Test.createTestingModule({
    providers: [
      TpAwardsReaderService,
      { provide: TpSourceReader, useValue: sourceReader },
      { provide: AwardsParserService, useValue: parser },
      { provide: ImportResultService, useValue: importResults },
    ],
  }).compile();
  return {
    service: moduleRef.get(TpAwardsReaderService),
    sourceReader,
    parser,
    importResults,
  };
}

const award: TpAward = { id: 1, awardType: 1, rosterId: 7 };

describe('TpAwardsReaderService', () => {
  it("groups each competition directory's parsed awards by era and competition", async () => {
    const parser = mock<AwardsParserService>();
    parser.parse.mockReturnValue([award]);
    const { service } = await makeService(
      [
        {
          era: 'Third era',
          competition: 'tloegbbl-sasong-29',
          type: 'awards',
          filename: 'awards_tloegbbl-sasong-29_awards.json',
          content: { '1': [] },
        },
      ],
      parser,
    );
    const errors: ImportError[] = [];

    const result = await service.getAwardsByDirectory(errors);

    expect(result).toEqual(
      new Map([['Third era::tloegbbl-sasong-29', [award]]]),
    );
    expect(errors).toEqual([]);
  });

  it('asks the source reader only for awards files', async () => {
    const { service, sourceReader } = await makeService([]);

    await service.getAwardsByDirectory([]);

    expect(sourceReader.filesOfType).toHaveBeenCalledWith('awards');
  });

  it('leaves a competition with no awards file out of the map', async () => {
    const { service } = await makeService([]);

    await expect(service.getAwardsByDirectory([])).resolves.toEqual(new Map());
  });

  it('accumulates awards from two files in the same directory instead of overwriting', async () => {
    const otherAward: TpAward = { id: 2, awardType: 2, rosterId: 8 };
    const parser = mock<AwardsParserService>();
    parser.parse.mockReturnValueOnce([award]).mockReturnValueOnce([otherAward]);
    const { service } = await makeService(
      [
        {
          era: 'Third era',
          competition: 'tloegbbl-sasong-29',
          type: 'awards',
          filename: 'awards_tloegbbl-sasong-29_awards.json',
          content: { '1': [] },
        },
        {
          era: 'Third era',
          competition: 'tloegbbl-sasong-29',
          type: 'awards',
          filename: 'awards_tloegbbl-sasong-29_awards_2.json',
          content: { '1': [] },
        },
      ],
      parser,
    );
    const errors: ImportError[] = [];

    const result = await service.getAwardsByDirectory(errors);

    expect(result).toEqual(
      new Map([['Third era::tloegbbl-sasong-29', [award, otherAward]]]),
    );
    expect(errors).toEqual([]);
  });

  it('records an error and skips only the malformed file', async () => {
    const parser = mock<AwardsParserService>();
    parser.parse
      .mockImplementationOnce(() => {
        throw new Error('bad shape');
      })
      .mockReturnValueOnce([award]);
    const { service } = await makeService(
      [
        {
          era: 'Third era',
          competition: 'broken',
          type: 'awards',
          filename: 'awards_broken_awards.json',
          content: {},
        },
        {
          era: 'Third era',
          competition: 'good',
          type: 'awards',
          filename: 'awards_good_awards.json',
          content: {},
        },
      ],
      parser,
    );
    const errors: ImportError[] = [];

    const result = await service.getAwardsByDirectory(errors);

    expect(result).toEqual(new Map([['Third era::good', [award]]]));
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('awards_broken_awards.json');
  });

  it('records an error when the directory scan itself throws', async () => {
    const sourceReader = mock<TpSourceReader>();
    sourceReader.filesOfType.mockImplementation(async function* () {
      await Promise.resolve();
      const noFiles: TpSourceFile[] = [];
      for (const file of noFiles) {
        yield file;
      }
      throw new Error('missing era directory');
    });
    const importResults = mockImportResultService();
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpAwardsReaderService,
        { provide: TpSourceReader, useValue: sourceReader },
        { provide: AwardsParserService, useValue: mock<AwardsParserService>() },
        { provide: ImportResultService, useValue: importResults },
      ],
    }).compile();
    const service = moduleRef.get(TpAwardsReaderService);
    const errors: ImportError[] = [];

    await expect(service.getAwardsByDirectory(errors)).resolves.toEqual(
      new Map(),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('missing era directory');
  });
});
