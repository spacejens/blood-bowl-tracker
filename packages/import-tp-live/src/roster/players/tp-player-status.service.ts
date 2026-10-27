import type { PlayerStatus } from '@blood-bowl-tracker/domain-enums';
import { Injectable } from '@nestjs/common';

/** Dead. Inferred from TP data: every player with it has a Dead event. */
const DEAD_BIT = 8;
/** Left the roster without dying; TP does not tell fired from retired. */
const LEFT_ROSTER_BIT = 16;
/** Temporarily retired: may return to the roster. */
const TEMPORARILY_RETIRED_BIT = 8192;

/** What {@link TpPlayerStatusService.forPlayer} decides from. */
export interface TpPlayerStatusInput {
  /** TP's `lineUps[].state` bitmask, if the entry carried one. */
  state: number | undefined;
  /** TP's `lineUps[].isActive`, if the entry carried one. */
  isActive: boolean | undefined;
  /** Whether the standalone roster file lists the player (not snapshot-only). */
  listed: boolean;
}

/**
 * Derives a TP player's current status from the `state` bitmask TP puts on
 * every `lineUps[]` entry. TP does not document the bits; their meaning is
 * inferred from the data (see docs/import-tp/file-format-rosters.md).
 */
@Injectable()
export class TpPlayerStatusService {
  /**
   * The status to send for one player, or `null` when TP's data does not
   * establish one. Checked in order: dead, then left the roster (recorded as
   * retired, which also wins over a temporary retirement the player then
   * left from), then temporarily retired. A player with none of those bits
   * is active only when the roster file lists them and flags them active: a
   * player seen only in a match snapshot is never known to be active. A
   * missing `state` matches no bit, so it is treated like any other player
   * with none of those bits.
   */
  forPlayer({
    state,
    isActive,
    listed,
  }: TpPlayerStatusInput): PlayerStatus | null {
    if (this.hasBit(state, DEAD_BIT)) {
      return 'dead';
    }
    if (this.hasBit(state, LEFT_ROSTER_BIT)) {
      return 'retired';
    }
    if (this.hasBit(state, TEMPORARILY_RETIRED_BIT)) {
      return 'temporarily_retired';
    }
    return listed && isActive === true ? 'active' : null;
  }

  /** Whether `state` has the single-bit flag `bit` set. */
  private hasBit(state: number | undefined, bit: number): boolean {
    return state !== undefined && (state & bit) !== 0;
  }
}
