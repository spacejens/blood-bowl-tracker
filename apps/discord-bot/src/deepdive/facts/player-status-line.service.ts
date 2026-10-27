import type { PlayerStatus } from '@blood-bowl-tracker/domain-enums';
import { Injectable } from '@nestjs/common';

export interface PlayerStatusLineInput {
  /** The player's stored status; `null` when no source has reported one. */
  status: PlayerStatus | null;
  /** The player's era's last day (`YYYY-MM-DD`), or `null` while it runs. */
  eraEndDate: string | null;
  /** The current time, from `ClockService`. */
  today: Date;
}

/** How each stored status reads on the line, in plain words. */
const STATUS_LABELS: Record<PlayerStatus, string> = {
  active: 'Active',
  dead: 'Killed',
  retired: 'Retired',
  temporarily_retired: 'Temporarily retired',
};

/**
 * Statuses that describe where the player stands within their era, so they
 * are qualified once that era is over: the player was still in that state
 * when the era closed, not now. `retired` and `dead` are permanent, so the
 * era does not change them.
 */
const ERA_BOUND_STATUSES: ReadonlySet<PlayerStatus> = new Set<PlayerStatus>([
  'active',
  'temporarily_retired',
]);

/**
 * Builds the player deepdive's `Status:` line from a player's stored status,
 * for a player whose death is not recorded in match events (that case gets
 * the killer line instead).
 *
 * Whether the era has ended is decided here, at display time, and never
 * stored. An era has ended once its end date is strictly before today's
 * date, read in UTC. An era ending today still counts as running.
 */
@Injectable()
export class PlayerStatusLineService {
  build({ status, eraEndDate, today }: PlayerStatusLineInput): string {
    if (status === null) {
      return 'Status: Unknown';
    }
    const label = STATUS_LABELS[status];
    return ERA_BOUND_STATUSES.has(status) && this.eraEnded(eraEndDate, today)
      ? `Status: ${label} until the end of the era`
      : `Status: ${label}`;
  }

  private eraEnded(eraEndDate: string | null, today: Date): boolean {
    return eraEndDate !== null && eraEndDate < today.toISOString().slice(0, 10);
  }
}
