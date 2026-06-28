import { describe, it, expect, vi } from 'vitest';
import { importBblData } from './bbl-importer';
import type { BblExport } from './bbl-types';

const bblData: BblExport = {
  teams: [{ id: 't1', name: 'Green Mashers', race: 'Orc', coachName: 'Gruk' }],
  players: [],
  matches: [],
};

describe('importBblData', () => {
  it('creates teams via the api client and returns a result', async () => {
    const createdTeam = {
      id: 1,
      name: 'Green Mashers',
      race: 'Orc',
      coach: 'Gruk',
      createdAt: new Date(),
    };
    const mockClient = {
      teams: {
        create: vi.fn().mockResolvedValue({ status: 201, body: createdTeam }),
      },
      matches: {
        create: vi.fn().mockResolvedValue({ status: 201, body: {} }),
      },
      matchEvents: {
        create: vi.fn().mockResolvedValue({ status: 201, body: {} }),
      },
    };

    const result = await importBblData(bblData, mockClient as never);
    expect(result.success).toBe(true);
    expect(result.imported).toBe(1);
    expect(mockClient.teams.create).toHaveBeenCalledWith({
      body: { name: 'Green Mashers', race: 'Orc', coach: 'Gruk' },
    });
  });

  it('records an error when team creation fails', async () => {
    const mockClient = {
      teams: {
        create: vi.fn().mockResolvedValue({ status: 500, body: {} }),
      },
      matches: { create: vi.fn() },
      matchEvents: { create: vi.fn() },
    };

    const result = await importBblData(bblData, mockClient as never);
    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('Green Mashers');
  });
});
