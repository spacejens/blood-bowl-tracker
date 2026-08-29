import type { ConfigLoader } from '@blood-bowl-tracker/config-loader';
import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { createExternalSystemNameConfigServiceBase } from './external-system-name-config-service-base';

/** Stand-in for a tool's own config service; used only as a DI token. */
@Injectable()
class TestToolConfigService implements ConfigLoader {
  get<T>(_key: string): T | undefined {
    return undefined;
  }
}

@Injectable()
class TestExternalSystemNameConfigService extends createExternalSystemNameConfigServiceBase(
  {
    configService: TestToolConfigService,
    defaultSystemName: 'TEST',
  },
) {}

describe('createExternalSystemNameConfigServiceBase', () => {
  let service: TestExternalSystemNameConfigService;
  let config: MockProxy<TestToolConfigService>;

  beforeEach(async () => {
    config = mock<TestToolConfigService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        TestExternalSystemNameConfigService,
        { provide: TestToolConfigService, useValue: config },
      ],
    }).compile();
    service = moduleRef.get(TestExternalSystemNameConfigService);
  });

  function stub(name: unknown): void {
    config.get.mockImplementation((key: string) =>
      key === 'externalSystemName' ? name : undefined,
    );
  }

  it('reads the externalSystemName key', () => {
    stub('MyLeague');
    expect(service.getSystemName()).toBe('MyLeague');
    expect(config.get).toHaveBeenCalledWith('externalSystemName');
  });

  it('falls back to the configured default when the key is unset', () => {
    stub(undefined);
    expect(service.getSystemName()).toBe('TEST');
  });

  it('falls back to the default for an empty string', () => {
    stub('');
    expect(service.getSystemName()).toBe('TEST');
  });

  it('falls back to the default for a whitespace-only string', () => {
    stub('   ');
    expect(service.getSystemName()).toBe('TEST');
  });

  it('falls back to the default for a non-string value', () => {
    stub(42);
    expect(service.getSystemName()).toBe('TEST');
  });
});
