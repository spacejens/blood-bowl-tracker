import type {
  FillIncompletePlayer,
  PlayerSkillEntry,
} from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

import type { PlannedFillRow, StoredFillRow } from './player-fill.types';

/**
 * Turns a fill into the `playerSkills.sync` entries that write it, and those
 * entries (after the free-extra rules) into the rows the player ends with.
 *
 * Every advancement is sent confirmed and numbered 1 to n in the order
 * listed; the sync closes up the number of any that is a free extra, so the
 * paid ones keep one numbering from 1, which `plan` reproduces.
 *
 * Pure decision logic, with no I/O and no dependencies.
 */
@Injectable()
export class PlayerFillEntriesService {
  entries(data: FillIncompletePlayer): PlayerSkillEntry[] {
    const { playerId } = data;
    const starting = data.startingSkills.map((skill): PlayerSkillEntry => ({
      playerId,
      skillId: skill.skillId,
      source: 'starting',
      attributeValue: skill.attributeValue,
    }));
    const gained = data.advancements.map(
      (advancement, at): PlayerSkillEntry => {
        const order = { advancementOrder: at + 1, orderConfirmed: true };
        if (advancement.kind === 'characteristic') {
          return {
            playerId,
            source: 'characteristic',
            characteristic: advancement.characteristic,
            ...order,
          };
        }
        return {
          playerId,
          skillId: advancement.skillId,
          source: advancement.source,
          attributeValue: advancement.attributeValue,
          isFreeExtra: advancement.isFreeExtra,
          ...order,
        };
      },
    );
    return [...starting, ...gained];
  }

  plan(resolved: PlayerSkillEntry[]): PlannedFillRow[] {
    let paid = 0;
    return resolved.map((entry): PlannedFillRow => {
      const isFreeExtra = entry.isFreeExtra === true;
      const isPaid = entry.source !== 'starting' && !isFreeExtra;
      if (isPaid) {
        paid += 1;
      }
      return {
        skillId: entry.skillId ?? null,
        characteristic: entry.characteristic ?? null,
        attributeValue: entry.attributeValue ?? null,
        source: entry.source,
        isFreeExtra,
        paidNumber: isPaid ? paid : null,
      };
    });
  }

  /**
   * The starting Loner rows a journeyman fill leaves him with, which the
   * entry itself does not list: each active starting row of a Loner skill
   * he holds, as stored. When he holds none, the row expected is the
   * lowest-id Loner without a variant, which is what an insert writes. None
   * while no skill is named Loner, since nothing is then inserted.
   */
  journeymanLonerRows(
    stored: readonly StoredFillRow[],
    lonerIds: readonly number[],
  ): PlannedFillRow[] {
    const held = stored.filter(
      (row) =>
        row.source === 'starting' &&
        row.skillId !== null &&
        lonerIds.includes(row.skillId),
    );
    if (held.length > 0) {
      return held.map((row) => ({
        skillId: row.skillId,
        characteristic: null,
        attributeValue: row.attributeValue,
        source: 'starting',
        isFreeExtra: row.isFreeExtra,
        paidNumber: null,
      }));
    }
    const [lonerId] = lonerIds;
    return lonerId === undefined
      ? []
      : [
          {
            skillId: lonerId,
            characteristic: null,
            attributeValue: null,
            source: 'starting',
            isFreeExtra: false,
            paidNumber: null,
          },
        ];
  }
}
