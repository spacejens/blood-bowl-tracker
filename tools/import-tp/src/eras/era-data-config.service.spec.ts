import { describe, expect, it } from 'vitest';

import type { ImportTpConfigService } from '../config/import-tp-config.service';
import { EraDataConfigService } from './era-data-config.service';

function makeService(eras: unknown): EraDataConfigService {
  const config = {
    get: (key: string) => (key === 'eras' ? eras : undefined),
  } as unknown as ImportTpConfigService;
  return new EraDataConfigService(config);
}

const validEras = [
  { name: 'Fourth era', dataSubdir: 'fourth-era' },
  { name: 'Second dungeon bowl era', dataSubdir: 'second-dungeon-bowl-era' },
];

describe('EraDataConfigService', () => {
  it('parses a valid eras array', () => {
    const eras = makeService(validEras).getEras();
    expect(eras).toEqual([
      { name: 'Fourth era', dataSubdir: 'fourth-era' },
      {
        name: 'Second dungeon bowl era',
        dataSubdir: 'second-dungeon-bowl-era',
      },
    ]);
  });

  it('throws when eras is not set', () => {
    expect(() => makeService(undefined).getEras()).toThrow(
      'eras is not set in import-tp-config.json5',
    );
  });

  it('throws when eras is not a non-empty array', () => {
    expect(() => makeService([]).getEras()).toThrow('non-empty');
  });

  it('throws when an entry is not an object', () => {
    expect(() => makeService(['fourth-era']).getEras()).toThrow(
      'TP_ERAS[0] must be an object',
    );
  });

  it('throws when an entry has an empty name', () => {
    expect(() =>
      makeService([{ name: '', dataSubdir: 'fourth-era' }]).getEras(),
    ).toThrow('TP_ERAS[0].name must be a non-empty string');
  });

  it('throws when an entry has an empty dataSubdir', () => {
    expect(() =>
      makeService([{ name: 'Fourth era', dataSubdir: '' }]).getEras(),
    ).toThrow('TP_ERAS[0].dataSubdir must be a non-empty string');
  });

  it('throws when two entries share the same name', () => {
    expect(() =>
      makeService([
        { name: 'Fourth era', dataSubdir: 'fourth-era' },
        { name: 'Fourth era', dataSubdir: 'other' },
      ]).getEras(),
    ).toThrow('TP_ERAS: era name "Fourth era" appears more than once');
  });

  it('throws when two entries share the same dataSubdir', () => {
    expect(() =>
      makeService([
        { name: 'Fourth era', dataSubdir: 'fourth-era' },
        { name: 'Other', dataSubdir: 'fourth-era' },
      ]).getEras(),
    ).toThrow('TP_ERAS: dataSubdir "fourth-era" appears more than once');
  });
});
