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
      'race',
    );
    expect(map.resolve({ system: 'BBL', id: 'id:47' }, 'race')).toBe(99);
    expect(
      map.resolve({ system: 'Name', id: 'name:necromantic' }, 'race'),
    ).toBe(99);
  });

  it('returns undefined for an unknown ref', () => {
    const map = new ExternalIdMap();
    expect(
      map.resolve({ system: 'Name', id: 'name:missing' }, 'race'),
    ).toBeUndefined();
  });

  it('does not collide on the same id under different systems', () => {
    const map = new ExternalIdMap();
    map.add([{ system: 'A', id: 'id:1' }], 1, 'race');
    map.add([{ system: 'B', id: 'id:1' }], 2, 'race');
    expect(map.resolve({ system: 'A', id: 'id:1' }, 'race')).toBe(1);
    expect(map.resolve({ system: 'B', id: 'id:1' }, 'race')).toBe(2);
  });

  // The direct regression test for issue #480: in the real curated data both
  // races-and-positions.json5 and competitions.json5 register ids under
  // "tloeg.bbleague.se", and BBL's numeric race ids collide with its numeric
  // competition ids. Before kind scoping, the competitions processor silently
  // clobbered the race's entry and SPP award values resolved a race ref to a
  // competition's row id, blowing up the spp_award_values race_id foreign key.
  it('keeps two entity kinds that share one external id apart', () => {
    const map = new ExternalIdMap();
    map.add([{ system: 'tloeg.bbleague.se', id: '44' }], 10, 'race');
    map.add([{ system: 'tloeg.bbleague.se', id: '44' }], 77, 'competition');

    expect(map.resolve({ system: 'tloeg.bbleague.se', id: '44' }, 'race')).toBe(
      10,
    );
    expect(
      map.resolve({ system: 'tloeg.bbleague.se', id: '44' }, 'competition'),
    ).toBe(77);
  });

  it('does not resolve a ref registered under a different kind', () => {
    const map = new ExternalIdMap();
    map.add([{ system: 'Name', id: 'name:orc' }], 10, 'race');

    expect(
      map.resolve({ system: 'Name', id: 'name:orc' }, 'team'),
    ).toBeUndefined();
  });

  it('throws when one kind+ref is registered to two different entities', () => {
    const map = new ExternalIdMap();
    map.add([{ system: 'Name', id: 'name:orc' }], 10, 'race');

    expect(() =>
      map.add([{ system: 'Name', id: 'name:orc' }], 11, 'race'),
    ).toThrow(
      'Duplicate external id for kind "race": Name|name:orc is already registered to entity 10, cannot register it to entity 11.',
    );
  });

  it('ignores a re-add of the same kind+ref to the same entity', () => {
    const map = new ExternalIdMap();
    map.add([{ system: 'Name', id: 'name:orc' }], 10, 'race');

    expect(() =>
      map.add([{ system: 'Name', id: 'name:orc' }], 10, 'race'),
    ).not.toThrow();
    expect(map.resolve({ system: 'Name', id: 'name:orc' }, 'race')).toBe(10);
  });
});
