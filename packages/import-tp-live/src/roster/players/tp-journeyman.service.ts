import { JourneymanRuleService } from '@blood-bowl-tracker/import-shared';
import type { TpRoster, TpRosterPlayer } from '@blood-bowl-tracker/parse-tp';
import { SkillMasterNamesParserService } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import type { ResolvedPlayerPosition } from './tp-player-position.service';

/** Options for {@link TpJourneymanService.decide}. */
export interface TpJourneymanDecideOptions {
  player: TpRosterPlayer;
  position: ResolvedPlayerPosition;
  roster: TpRoster;
  /** True when the roster file lists the player; false for a match-snapshot-only one. */
  isRosterEntry: boolean;
  /** From {@link TpJourneymanService.lonerMasterIds}; undefined without the raw roster JSON. */
  lonerMasterIds: ReadonlySet<number> | undefined;
}

/**
 * The TP side of the shared journeyman rule. A roster file's own entry is a
 * roster sighting, which states the marker from whether it lists Loner; a
 * player only a match snapshot carries is a line-up sighting, which can only
 * set it. A mercenary, Big Guy or roster star position is never basic. TP
 * names a skill only by its skillMasterId, so Loner's ids are read from the
 * skill masters the roster JSON embeds.
 */
@Injectable()
export class TpJourneymanService {
  constructor(
    private readonly skillMasterNames: SkillMasterNamesParserService,
    private readonly rule: JourneymanRuleService,
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

  /** The marker to send for one player; undefined leaves the stored one. */
  decide(options: TpJourneymanDecideOptions): boolean | undefined {
    const { player, position, roster, isRosterEntry, lonerMasterIds } = options;
    const isBasicPosition =
      position.mercenary === undefined &&
      !player.isBigGuy &&
      !roster.starPositions.some(
        (star) => star.tpPositionId === player.lineUpMasterId,
      );
    const skills = player.skills;
    const lonerListed =
      isRosterEntry && skills !== undefined && lonerMasterIds !== undefined
        ? [...skills.starting, ...skills.gained].some((ref) =>
            lonerMasterIds.has(ref.skillMasterId),
          )
        : undefined;
    return this.rule.decide({
      name: player.name,
      isBasicPosition,
      sighting: isRosterEntry ? 'roster' : 'lineUp',
      lonerListed,
    });
  }
}
