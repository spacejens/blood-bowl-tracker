import type { ImportError } from '@blood-bowl-tracker/api-contract';
import { JourneymanRuleService } from '@blood-bowl-tracker/import-shared';
import type { TpRoster, TpRosterPlayer } from '@blood-bowl-tracker/parse-tp';
import { SkillMasterNamesParserService } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import { TpSkillIdLookupService } from '../../tp-skill-id-lookup.service';
import type { ResolvedPlayerPosition } from './tp-player-position.service';

/** Options for {@link TpJourneymanService.decide}. */
export interface TpJourneymanDecideOptions {
  player: TpRosterPlayer;
  position: ResolvedPlayerPosition;
  roster: TpRoster;
  /** True when the roster file lists the player; false for a match-snapshot-only one. */
  isRosterEntry: boolean;
  /**
   * Loner's skillMasterIds: for a roster entry from
   * {@link TpJourneymanService.lonerMasterIds} (undefined without the raw
   * roster JSON), for a line-up from
   * {@link TpJourneymanService.lineUpLonerMasterIds}.
   */
  lonerMasterIds: ReadonlySet<number> | undefined;
}

/** Options for {@link TpJourneymanService.lineUpLonerMasterIds}. */
export interface TpLineUpLonerMasterIdsOptions {
  /** The roster's players seen only in match snapshots. */
  players: readonly TpRosterPlayer[];
  /** The Loner ids the roster JSON names, when it was given. */
  rosterLonerMasterIds: ReadonlySet<number> | undefined;
  tpSystemId: number;
  errors: ImportError[];
}

/**
 * The TP side of the shared journeyman rule. A roster file's own entry is a
 * roster sighting, which states the marker from whether it lists Loner; a
 * player only a match snapshot carries is a line-up sighting, which sets it
 * only when the snapshot's skills list Loner and otherwise leaves it alone.
 * A mercenary, Big Guy or roster star position is never basic. TP names a
 * skill only by its skillMasterId, so Loner's ids are read from the skill
 * masters the roster JSON embeds; a snapshot's bare ids the roster does not
 * name are named through the skills carrying them as TP external ids.
 */
@Injectable()
export class TpJourneymanService {
  constructor(
    private readonly skillMasterNames: SkillMasterNamesParserService,
    private readonly rule: JourneymanRuleService,
    private readonly skillIdLookup: TpSkillIdLookupService,
  ) {}

  /** The skillMasterIds the roster JSON names Loner. */
  lonerMasterIds(content: unknown): Set<number> {
    const ids = new Set<number>();
    for (const [id, master] of this.skillMasterNames.extract(content)) {
      if (this.rule.isLonerName(master.name)) {
        ids.add(id);
      }
    }
    return ids;
  }

  /**
   * The Loner ids to read the line-up sightings by: the roster's own, plus
   * every id a line-up player named Journeyman lists that the roster does
   * not name and whose skill in the database is named Loner. One lookup
   * covers the whole roster, and none is made when no such player lists an
   * id the roster leaves unnamed. A failed lookup is reported by it and
   * leaves only the roster's ids.
   */
  async lineUpLonerMasterIds({
    players,
    rosterLonerMasterIds,
    tpSystemId,
    errors,
  }: TpLineUpLonerMasterIdsOptions): Promise<Set<number>> {
    const ids = new Set(rosterLonerMasterIds);
    const unnamed = new Set<number>();
    for (const player of players) {
      if (!this.rule.isJourneymanName(player.name)) {
        continue;
      }
      for (const id of player.skillMasterIds ?? []) {
        if (!ids.has(id)) {
          unnamed.add(id);
        }
      }
    }
    if (unnamed.size === 0) {
      return ids;
    }
    const names = await this.skillIdLookup.namesByTpId({
      masterIds: [...unnamed],
      tpSystemId,
      errors,
    });
    for (const [id, name] of names ?? []) {
      if (this.rule.isLonerName(name)) {
        ids.add(id);
      }
    }
    return ids;
  }

  /** The marker to send for one player; undefined leaves the stored one. */
  decide(options: TpJourneymanDecideOptions): boolean | undefined {
    const { player, position, roster, isRosterEntry, lonerMasterIds } = options;
    const isBasicPosition =
      position.mercenary === undefined &&
      !player.isBigGuy &&
      !roster.starPositions.some(
        (star) => star.tpPositionId === player.lineUpMasterId,
      );
    const listedIds = isRosterEntry
      ? player.skills === undefined
        ? undefined
        : [...player.skills.starting, ...player.skills.gained].map(
            (ref) => ref.skillMasterId,
          )
      : player.skillMasterIds;
    const lonerListed =
      listedIds === undefined || lonerMasterIds === undefined
        ? undefined
        : listedIds.some((id) => lonerMasterIds.has(id));
    return this.rule.decide({
      name: player.name,
      isBasicPosition,
      sighting: isRosterEntry ? 'roster' : 'lineUp',
      lonerListed,
    });
  }
}
