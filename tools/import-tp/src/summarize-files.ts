import type { TpSourceFile } from './source/tp-source-reader';

interface EraSummary {
  competitions: Set<string>;
  typeCounts: Map<string, number>;
}

/**
 * Aggregate source files into one human-readable summary line per era, e.g.
 * `Fourth era: 3 competitions, 42 files (match: 12, rosters: 9, tournament: 15)`.
 * Eras and file types are listed in first-seen order.
 */
export function summarizeFiles(files: TpSourceFile[]): string[] {
  const byEra = new Map<string, EraSummary>();
  for (const file of files) {
    let summary = byEra.get(file.era);
    if (summary === undefined) {
      summary = { competitions: new Set(), typeCounts: new Map() };
      byEra.set(file.era, summary);
    }
    summary.competitions.add(file.competition);
    summary.typeCounts.set(
      file.type,
      (summary.typeCounts.get(file.type) ?? 0) + 1,
    );
  }

  const lines: string[] = [];
  for (const [era, { competitions, typeCounts }] of byEra) {
    const total = [...typeCounts.values()].reduce((sum, n) => sum + n, 0);
    const breakdown = [...typeCounts.entries()]
      .map(([type, count]) => `${type}: ${count}`)
      .join(', ');
    lines.push(
      `${era}: ${competitions.size} competitions, ${total} files (${breakdown})`,
    );
  }
  return lines;
}
