import type { ErasService } from '@blood-bowl-tracker/game-data';
import type { InteractionReplyOptions } from 'discord.js';

import {
  DATABASE_TIMEOUT_FALLBACK_MESSAGE,
  withDatabaseTimeout,
} from '../../database-timeout';

interface EraEntry {
  id: number;
  name: string;
  leagueName: string;
  startDate: string;
  endDate: string | null;
  rulesSetNames: string[];
}

export async function resolveErasList(
  eras: ErasService,
): Promise<string | InteractionReplyOptions> {
  const rows = await withDatabaseTimeout(eras.listErasWithLeague(), null);
  if (rows === null) {
    return DATABASE_TIMEOUT_FALLBACK_MESSAGE;
  }
  if (rows.length === 0) {
    return {
      embeds: [{ title: 'Eras', description: 'No data recorded yet.' }],
    };
  }

  const rulesSetNames = await withDatabaseTimeout(
    Promise.all(rows.map((row) => eras.getRulesSetNames(row.id))),
    null,
  );
  if (rulesSetNames === null) {
    return DATABASE_TIMEOUT_FALLBACK_MESSAGE;
  }

  const entries: EraEntry[] = rows.map((row, index) => ({
    ...row,
    rulesSetNames: rulesSetNames[index],
  }));

  const byLeague = new Map<string, EraEntry[]>();
  for (const entry of entries) {
    const list = byLeague.get(entry.leagueName) ?? [];
    list.push(entry);
    byLeague.set(entry.leagueName, list);
  }
  for (const list of byLeague.values()) {
    list.sort((a, b) => a.startDate.localeCompare(b.startDate));
  }
  const leaguesOrdered = [...byLeague.values()].sort((a, b) =>
    a[0].startDate.localeCompare(b[0].startDate),
  );

  const lines: string[] = [];
  for (const list of leaguesOrdered) {
    for (const era of list) {
      const end = era.endDate ?? 'present';
      let line = `${era.name} (${era.leagueName}): ${era.startDate} – ${end}`;
      if (era.rulesSetNames.length > 0) {
        line += ` — Rules: ${era.rulesSetNames.join(', ')}`;
      }
      lines.push(line);
    }
  }

  return { embeds: [{ title: 'Eras', description: lines.join('\n') }] };
}
