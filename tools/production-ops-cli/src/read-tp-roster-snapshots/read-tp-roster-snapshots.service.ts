import type { WriteFileResult } from '@blood-bowl-tracker/cli-shared';
import { Injectable } from '@nestjs/common';

import {
  TpRosterSnapshotExtractorService,
  type TpRosterSnapshotObservation,
  type TpRosterSnapshotUnreadable,
} from './tp-roster-snapshot-extractor.service';
import { TpRosterSnapshotIndexService } from './tp-roster-snapshot-index.service';
import { TpRosterSnapshotsStoreService } from './tp-roster-snapshots-store.service';

/** What `read-tp-roster-snapshots` prints. */
export interface ReadTpRosterSnapshotsSummary {
  readonly dataDir: string;
  readonly written: WriteFileResult;
  readonly matchFiles: number;
  readonly rosterFiles: number;
  /** Files that could not be read as snapshots, listed in the saved file. */
  readonly unreadable: number;
  /** TP player ids found. */
  readonly players: number;
  /** Players shown in more than one state. */
  readonly conflicts: number;
}

/**
 * `read-tp-roster-snapshots`: reads every downloaded TP match and roster
 * file and saves what each shows of every player, as evidence for the fill
 * generator. A file that cannot be read is recorded and the run goes on.
 */
@Injectable()
export class ReadTpRosterSnapshotsService {
  constructor(
    private readonly store: TpRosterSnapshotsStoreService,
    private readonly extractor: TpRosterSnapshotExtractorService,
    private readonly index: TpRosterSnapshotIndexService,
  ) {}

  async run(): Promise<ReadTpRosterSnapshotsSummary> {
    const files = await this.store.listSources();
    const observations: TpRosterSnapshotObservation[] = [];
    const unreadable: TpRosterSnapshotUnreadable[] = [];
    for (const file of files) {
      let content: unknown;
      try {
        content = await this.store.readSource(file);
      } catch (error) {
        unreadable.push({
          source: file.source,
          reason: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      const result = this.extractor.extract({
        kind: file.kind,
        source: file.source,
        content,
      });
      if (result.kind === 'unreadable') {
        unreadable.push({ source: file.source, reason: result.reason });
      } else {
        for (const row of result.observations) {
          observations.push(row);
        }
      }
    }
    const snapshots = this.index.build({ observations, unreadable });
    const written = await this.store.writeSnapshots(snapshots);
    return {
      dataDir: await this.store.dataDir(),
      written,
      matchFiles: files.filter((file) => file.kind === 'match').length,
      rosterFiles: files.filter((file) => file.kind === 'roster').length,
      unreadable: snapshots.unreadable.length,
      players: Object.keys(snapshots.players).length,
      conflicts: snapshots.conflicts.length,
    };
  }
}
