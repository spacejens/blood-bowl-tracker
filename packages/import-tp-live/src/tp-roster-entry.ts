import type { TpRoster } from '@blood-bowl-tracker/parse-tp';

/**
 * One parsed roster and the era it is imported under — what the team and
 * player upserts need. A bulk run reads it from a roster file (the era is the
 * directory it was found under); a live import fetches the roster and
 * resolves the era. A roster needs no competition to be imported: the team
 * and its players are complete entities on their own.
 */
export interface TpRosterEntry {
  roster: TpRoster;
  era: string;
}
