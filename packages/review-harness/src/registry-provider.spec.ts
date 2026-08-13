import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { DATA_TYPE_REVIEWERS } from './data-type-reviewer';
import { createRegistryProvider } from './registry-provider';
import { STRATIFIERS } from './stratifier';

@Injectable()
class FirstService {
  readonly id = 'first';
}

@Injectable()
class SecondService {
  readonly id = 'second';
}

describe('createRegistryProvider', () => {
  it('provides the listed services as one array under the token, in order', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        FirstService,
        SecondService,
        createRegistryProvider(DATA_TYPE_REVIEWERS, [
          FirstService,
          SecondService,
        ]),
      ],
    }).compile();

    const registry = moduleRef.get<{ id: string }[]>(DATA_TYPE_REVIEWERS);

    expect(registry.map((entry) => entry.id)).toEqual(['first', 'second']);
    expect(registry[0]).toBeInstanceOf(FirstService);
  });

  it('provides an empty array when no service is registered', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [createRegistryProvider(STRATIFIERS, [])],
    }).compile();

    expect(moduleRef.get(STRATIFIERS)).toEqual([]);
  });

  it('keeps the two registry tokens distinct', () => {
    expect(DATA_TYPE_REVIEWERS).not.toBe(STRATIFIERS);
  });
});
