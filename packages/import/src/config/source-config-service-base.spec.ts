import { resolve } from 'node:path';

import type { ConfigLoader } from '@blood-bowl-tracker/config-loader';
import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { createSourceConfigServiceBase } from './source-config-service-base';

/** Stand-in for a tool's own config service; used only as a DI token. */
@Injectable()
class TestToolConfigService implements ConfigLoader {
  get<T>(_key: string): T | undefined {
    return undefined;
  }
}

@Injectable()
class TestSourceConfigService extends createSourceConfigServiceBase({
  configService: TestToolConfigService,
  fileName: 'import-test-config.json5',
  dataDirDescription: 'containing the test source files (e.g. data/test/)',
}) {}

describe('createSourceConfigServiceBase', () => {
  let service: TestSourceConfigService;
  let config: MockProxy<TestToolConfigService>;

  beforeEach(async () => {
    config = mock<TestToolConfigService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        TestSourceConfigService,
        { provide: TestToolConfigService, useValue: config },
      ],
    }).compile();
    service = moduleRef.get(TestSourceConfigService);
  });

  function stub(dataDir: unknown): void {
    config.get.mockImplementation((key: string) =>
      key === 'dataDir' ? dataDir : undefined,
    );
  }

  it('resolves a relative dataDir against the current working directory', () => {
    stub('data/test');
    expect(service.getDataDir()).toBe(resolve('data/test'));
    expect(config.get).toHaveBeenCalledWith('dataDir');
  });

  it('returns an absolute dataDir unchanged', () => {
    stub('/srv/test/data');
    expect(service.getDataDir()).toBe('/srv/test/data');
  });

  it('throws a message naming the file and the expected folder when unset', () => {
    stub(undefined);
    expect(() => service.getDataDir()).toThrow(
      'dataDir is not set in import-test-config.json5. Set it to the folder ' +
        'containing the test source files (e.g. data/test/).',
    );
  });

  it('throws when dataDir is an empty string', () => {
    stub('');
    expect(() => service.getDataDir()).toThrow(
      'dataDir is not set in import-test-config.json5',
    );
  });

  it('throws when dataDir is not a string', () => {
    stub(42);
    expect(() => service.getDataDir()).toThrow(
      'dataDir is not set in import-test-config.json5',
    );
  });
});
