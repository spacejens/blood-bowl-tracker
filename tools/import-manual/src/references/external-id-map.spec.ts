import { describe, expect, it } from 'vitest';

import { ExternalIdMap } from './external-id-map';

describe('ExternalIdMap', () => {
  it('resolves a ref by any pair recorded for the same entity', () => {
    const map = new ExternalIdMap();
    map.add(
      [
        { system: 'BBL', id: 'id:47' },
        { system: 'Name', id: 'name:necromantic' },
      ],
      99,
    );
    expect(map.resolve({ system: 'BBL', id: 'id:47' })).toBe(99);
    expect(map.resolve({ system: 'Name', id: 'name:necromantic' })).toBe(99);
  });

  it('returns undefined for an unknown ref', () => {
    const map = new ExternalIdMap();
    expect(map.resolve({ system: 'Name', id: 'name:missing' })).toBeUndefined();
  });

  it('does not collide on the same id under different systems', () => {
    const map = new ExternalIdMap();
    map.add([{ system: 'A', id: 'id:1' }], 1);
    map.add([{ system: 'B', id: 'id:1' }], 2);
    expect(map.resolve({ system: 'A', id: 'id:1' })).toBe(1);
    expect(map.resolve({ system: 'B', id: 'id:1' })).toBe(2);
  });
});
