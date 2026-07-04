import type { BblExport } from './bbl-types';

export function parseBblExport(json: string): BblExport {
  const data: unknown = JSON.parse(json);

  if (
    typeof data !== 'object' ||
    data === null ||
    !Array.isArray((data as Record<string, unknown>).teams) ||
    !Array.isArray((data as Record<string, unknown>).players) ||
    !Array.isArray((data as Record<string, unknown>).matches) ||
    !Array.isArray((data as Record<string, unknown>).coaches)
  ) {
    throw new Error(
      'BBL export must contain teams, players, matches, and coaches arrays',
    );
  }

  return data as BblExport;
}
