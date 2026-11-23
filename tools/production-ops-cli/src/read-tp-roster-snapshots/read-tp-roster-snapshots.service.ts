import type { WriteFileResult } from '@blood-bowl-tracker/cli-shared';
import { Injectable } from '@nestjs/common';

import {
  type TpRosterCopy,
  type TpRosterCopyLocation,
  TpRosterCopyReaderService,
} from './tp-roster-copy-reader.service';
import { TpRosterCopySelectionService } from './tp-roster-copy-selection.service';
import {
  TpRosterSnapshotExtractorService,
  type TpRosterSnapshotObservation,
  type TpRosterSnapshotUnreadable,
} from './tp-roster-snapshot-extractor.service';
import { TpRosterSnapshotIndexService } from './tp-roster-snapshot-index.service';
import type { TpRosterSnapshots } from './tp-roster-snapshots.schema';
import {
  type TpRosterSnapshotSourceFile,
  TpRosterSnapshotsStoreService,
} from './tp-roster-snapshots-store.service';

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
  /** Era directory and roster id groups of roster copies. */
  readonly rosterCopies: number;
  /** Groups where which copy the TP import sends is unknown. */
  readonly rosterCopiesUndetermined: number;
}

interface Collected {
  observations: TpRosterSnapshotObservation[];
  unreadable: TpRosterSnapshotUnreadable[];
  copies: TpRosterCopy[];
  unreadableCopies: TpRosterCopyLocation[];
}

/**
 * `read-tp-roster-snapshots`: reads every downloaded TP match and roster
 * file and saves what each shows of every player, and which roster copies
 * the TP import sends, as evidence for the fill generator. A file that
 * cannot be read is recorded and the run goes on.
 */
@Injectable()
export class ReadTpRosterSnapshotsService {
  constructor(
    private readonly store: TpRosterSnapshotsStoreService,
    private readonly extractor: TpRosterSnapshotExtractorService,
    private readonly index: TpRosterSnapshotIndexService,
    private readonly copyReader: TpRosterCopyReaderService,
    private readonly selection: TpRosterCopySelectionService,
  ) {}

  async run(): Promise<ReadTpRosterSnapshotsSummary> {
    const files = await this.store.listSources();
    const collected: Collected = {
      observations: [],
      unreadable: [],
      copies: [],
      unreadableCopies: [],
    };
    for (const file of files) {
      await this.collect(file, collected);
    }
    const snapshots: TpRosterSnapshots = {
      ...this.index.build({
        observations: collected.observations,
        unreadable: collected.unreadable,
      }),
      rosterCopies: this.selection.select({
        copies: collected.copies,
        unreadable: collected.unreadableCopies,
      }),
    };
    const written = await this.store.writeSnapshots(snapshots);
    return {
      dataDir: await this.store.dataDir(),
      written,
      matchFiles: files.filter((file) => file.kind === 'match').length,
      rosterFiles: files.filter((file) => file.kind === 'roster').length,
      unreadable: snapshots.unreadable.length,
      players: Object.keys(snapshots.players).length,
      conflicts: snapshots.conflicts.length,
      rosterCopies: snapshots.rosterCopies.length,
      rosterCopiesUndetermined: snapshots.rosterCopies.filter(
        (group) => group.chosen.length === 0,
      ).length,
    };
  }

  private async collect(
    file: TpRosterSnapshotSourceFile,
    collected: Collected,
  ): Promise<void> {
    let content: unknown;
    try {
      content = await this.store.readSource(file);
    } catch (error) {
      collected.unreadable.push({
        source: file.source,
        reason: error instanceof Error ? error.message : String(error),
      });
      if (file.kind === 'roster') {
        collected.unreadableCopies.push(this.copyReader.locate(file.source));
      }
      return;
    }
    const result = this.extractor.extract({
      kind: file.kind,
      source: file.source,
      content,
    });
    if (result.kind === 'unreadable') {
      collected.unreadable.push({ source: file.source, reason: result.reason });
    } else {
      collected.observations.push(...result.observations);
    }
    if (file.kind !== 'roster') {
      return;
    }
    const copy = this.copyReader.read({ source: file.source, content });
    if (copy.kind === 'copy') {
      collected.copies.push(copy.copy);
      return;
    }
    collected.unreadableCopies.push(copy.location);
    if (result.kind !== 'unreadable') {
      collected.unreadable.push({ source: file.source, reason: copy.reason });
    }
  }
}
