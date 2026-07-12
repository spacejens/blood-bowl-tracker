import { describe, expect, it } from 'vitest';

import { PlayerSchema, UpsertPlayerSchema } from './player';

describe('player schemas', () => {
  it('PlayerSchema parses a valid player', () => {
    const parsed = PlayerSchema.parse({
      id: 1,
      name: 'Griff Oberwald',
      teamEraId: 10,
      positionId: 20,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(parsed.name).toBe('Griff Oberwald');
    expect(parsed.createdAt).toBeInstanceOf(Date);
  });

  it('UpsertPlayerSchema rejects an empty name', () => {
    expect(() =>
      UpsertPlayerSchema.parse({
        name: '',
        teamEraId: 10,
        positionId: 20,
        externalIds: [{ externalSystemId: 1, externalId: 'x' }],
      }),
    ).toThrow();
  });

  it('UpsertPlayerSchema rejects an empty externalIds array', () => {
    expect(() =>
      UpsertPlayerSchema.parse({
        name: 'Griff Oberwald',
        teamEraId: 10,
        positionId: 20,
        externalIds: [],
      }),
    ).toThrow();
  });
});
