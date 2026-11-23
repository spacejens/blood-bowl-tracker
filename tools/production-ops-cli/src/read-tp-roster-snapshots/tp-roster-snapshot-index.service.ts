import { Injectable } from '@nestjs/common';

import type {
  TpRosterSnapshotObservation,
  TpRosterSnapshotUnreadable,
} from './tp-roster-snapshot-extractor.service';
import type {
  TpRosterPlayerSnapshots,
  TpRosterSnapshotState,
  TpRosterSnapshotVariant,
} from './tp-roster-snapshots.schema';

export interface BuildSnapshotsInput {
  observations: readonly TpRosterSnapshotObservation[];
  unreadable: readonly TpRosterSnapshotUnreadable[];
}

interface Seen {
  state: TpRosterSnapshotState;
  sources: Set<string>;
}

/**
 * Builds the players part of `snapshots.json` from every file's
 * observations: each player's distinct states, with the files showing each.
 * A player shown in more than one state is kept with all of them and listed
 * under `conflicts`. Players, states and sources are sorted, so the file does
 * not depend on the order the files were read in.
 *
 * Pure decision logic, with no I/O and no dependencies.
 */
@Injectable()
export class TpRosterSnapshotIndexService {
  build(input: BuildSnapshotsInput): TpRosterPlayerSnapshots {
    const byPlayer = new Map<string, Map<string, Seen>>();
    for (const row of input.observations) {
      const states = byPlayer.get(row.playerId) ?? new Map<string, Seen>();
      const key = this.key(row.state);
      const seen = states.get(key) ?? { state: row.state, sources: new Set() };
      seen.sources.add(row.source);
      states.set(key, seen);
      byPlayer.set(row.playerId, states);
    }
    const ids = [...byPlayer.keys()].sort((a, b) => Number(a) - Number(b));
    const players: Record<string, TpRosterSnapshotVariant[]> = {};
    for (const id of ids) {
      const states = byPlayer.get(id) ?? new Map<string, Seen>();
      players[id] = [...states.entries()]
        .sort(([a], [b]) => this.compare(a, b))
        .map(([, seen]) => ({
          ...seen.state,
          sources: [...seen.sources].sort((a, b) => this.compare(a, b)),
        }));
    }
    return {
      players,
      conflicts: ids.filter((id) => players[id].length > 1),
      unreadable: [...input.unreadable].sort((a, b) =>
        this.compare(a.source, b.source),
      ),
    };
  }

  private key(state: TpRosterSnapshotState): string {
    return JSON.stringify([
      state.lineUpMasterId,
      state.level,
      state.totalSpp,
      state.unspentSpp,
      state.skillMasterIds,
    ]);
  }

  /** Code-unit order, so the result does not depend on the runtime's locale. */
  private compare(a: string, b: string): number {
    if (a < b) {
      return -1;
    }
    return a > b ? 1 : 0;
  }
}
