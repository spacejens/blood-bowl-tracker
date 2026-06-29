import { describe, it, expect, vi } from 'vitest';
import { importBblData } from './bbl-importer';
import type { BblExport } from './bbl-types';

const bblData: BblExport = {
  teams: [{ id: 't1', name: 'Green Mashers', race: 'Orc', coachName: 'Gruk' }],
  players: [],
  matches: [],
};

describe('importBblData', () => {
  it('reports an error for each team pending race/coach ID resolution', async () => {
    const mockClient = {
      teams: { create: vi.fn() },
      matches: { create: vi.fn() },
      matchEvents: { create: vi.fn() },
    };

    const result = await importBblData(bblData, mockClient as never);
    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('Green Mashers');
    expect(mockClient.teams.create).not.toHaveBeenCalled();
  });
});
