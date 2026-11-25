import {
  RosterParserService,
  type TpRoster,
} from '@blood-bowl-tracker/parse-tp';
import { TpFileNameService } from '@blood-bowl-tracker/read-tp-files';
import { Injectable } from '@nestjs/common';

/** One (era directory, roster id) group of roster copies. */
export interface TpRosterCopyLocation {
  /** The era directory: the first segment of the source path. */
  readonly era: string;
  readonly rosterId: string;
}

/** One downloaded copy of a roster, as the TP import chooses between them. */
export interface TpRosterCopy extends TpRosterCopyLocation {
  /** The file's path relative to the TP data directory. */
  readonly source: string;
  /** When its newest listed match finished (epoch ms); null when none did. */
  readonly finishedAt: number | null;
  /** The TP player (line-up) ids it lists, in numeric order. */
  readonly playerIds: readonly string[];
}

export type ReadRosterCopyResult =
  | { kind: 'copy'; copy: TpRosterCopy }
  | { kind: 'unreadable'; location: TpRosterCopyLocation; reason: string };

/**
 * Reads what tells one downloaded roster copy apart from the others of its
 * roster: its era directory, roster id, players and the instant its newest
 * match finished. It parses the copy with packages/parse-tp's
 * RosterParserService, as tools/import-tp's RosterCollectionService does,
 * so a copy the TP import drops as unparseable is unreadable here too,
 * located by its path so its group can still be marked.
 */
@Injectable()
export class TpRosterCopyReaderService {
  constructor(
    private readonly parser: RosterParserService,
    private readonly names: TpFileNameService,
  ) {}

  read(input: { source: string; content: unknown }): ReadRosterCopyResult {
    const location = this.locate(input.source);
    let roster: TpRoster;
    try {
      roster = this.parser.parse(input.content);
    } catch (error) {
      return {
        kind: 'unreadable',
        location,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
    return {
      kind: 'copy',
      copy: {
        era: location.era,
        rosterId: String(roster.id),
        source: input.source,
        finishedAt: roster.lastMatchFinishedAt ?? null,
        playerIds: roster.players
          .map((player) => String(player.id))
          .sort((a, b) => Number(a) - Number(b)),
      },
    };
  }

  /** The group a copy belongs to, from its path alone. */
  locate(source: string): TpRosterCopyLocation {
    const segments = source.split('/');
    const kind = this.names.classify(segments[segments.length - 1]);
    return {
      era: segments[0],
      rosterId: kind.kind === 'rosters' ? kind.rosterId : source,
    };
  }
}
