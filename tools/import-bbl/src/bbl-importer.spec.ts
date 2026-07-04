import { describe, it, expect, vi } from 'vitest';
import { importBblData } from './bbl-importer';
import type { BblExport } from './bbl-types';

const bblData: BblExport = {
  teams: [{ id: 't1', name: 'Green Mashers', race: 'Orc', coachId: 'c1' }],
  players: [],
  matches: [],
  coaches: [{ id: 'c1', name: 'Gruk' }],
};

function makeMockClient() {
  return {
    externalSystems: {
      upsert: vi.fn().mockResolvedValue({
        status: 201,
        body: { id: 1, name: 'BBL', createdAt: new Date('2026-01-01') },
      }),
    },
    coaches: {
      upsert: vi.fn().mockResolvedValue({
        status: 201,
        body: { id: 10, name: 'Gruk', createdAt: new Date('2026-01-01') },
      }),
    },
    teams: { create: vi.fn() },
    matches: { create: vi.fn() },
    matchEvents: { create: vi.fn() },
  };
}

describe('importBblData', () => {
  it('upserts the BBL external system once', async () => {
    const client = makeMockClient();
    await importBblData(bblData, client as never);
    expect(client.externalSystems.upsert).toHaveBeenCalledTimes(1);
    expect(client.externalSystems.upsert).toHaveBeenCalledWith({
      body: { name: 'BBL' },
    });
  });

  it('upserts each coach with id: and name: external IDs', async () => {
    const client = makeMockClient();
    await importBblData(bblData, client as never);
    expect(client.coaches.upsert).toHaveBeenCalledTimes(1);
    expect(client.coaches.upsert).toHaveBeenCalledWith({
      body: {
        name: 'Gruk',
        externalIds: [
          { externalSystemId: 1, externalId: 'id:c1' },
          { externalSystemId: 1, externalId: 'name:gruk' },
        ],
      },
    });
  });

  it('reports a coach as an error when the upsert call fails', async () => {
    const client = makeMockClient();
    client.coaches.upsert.mockResolvedValue({
      status: 409,
      body: { message: 'conflict' },
    });

    const result = await importBblData(bblData, client as never);

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.message.includes('Gruk'))).toBe(true);
  });

  it('reports one error and skips coach upserts when the external system upsert fails', async () => {
    const client = makeMockClient();
    client.externalSystems.upsert.mockResolvedValue({
      status: 500,
      body: { message: 'internal error' },
    });

    const result = await importBblData(bblData, client as never);

    expect(result.success).toBe(false);
    expect(
      result.errors.some((e) => e.message.includes('external system')),
    ).toBe(true);
    expect(client.coaches.upsert).not.toHaveBeenCalled();
  });

  it('reports an error for each team pending race ID resolution', async () => {
    const client = makeMockClient();

    const result = await importBblData(bblData, client as never);

    expect(result.errors.some((e) => e.message.includes('Green Mashers'))).toBe(
      true,
    );
    expect(client.teams.create).not.toHaveBeenCalled();
  });
});
