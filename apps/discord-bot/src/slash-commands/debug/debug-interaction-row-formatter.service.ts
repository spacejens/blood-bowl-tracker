import type { InteractionEventRow } from '@blood-bowl-tracker/discord-bot-usage';
import { Injectable } from '@nestjs/common';

/** Shown for a parameter the bot recorded with a null value. */
const EMPTY_PARAMETER_VALUE = '<empty>';

/**
 * Turns recorded interactions into the `/debuginteractions` embed
 * description: one line per interaction, newest first (the order the query
 * returns them in), as
 *
 *   <t:UNIX:f> — coach42 in Test League #general — /insights (race: Orc, era: Classic) — ✅
 *   <t:UNIX:f> — zog in a DM — button coach:42 — ❌ PLAYER_NOT_FOUND
 *
 * The timestamp is Discord's own `<t:...:f>` markdown, so each viewer sees it
 * in their own locale and timezone and nothing has to be formatted
 * server-side.
 *
 * Pure text assembly with no dependencies, so specs for its consumers pass it
 * as a real provider (see CLAUDE.md, "A pure, dependency-free formatting
 * service is the other [exception]").
 */
@Injectable()
export class DebugInteractionRowFormatterService {
  describe(rows: InteractionEventRow[]): string {
    return rows.map((row) => this.line(row)).join('\n');
  }

  private line(row: InteractionEventRow): string {
    const triggered = [this.trigger(row), this.parameters(row)]
      .filter((segment) => segment !== '')
      .join(' ');
    return `${this.timestamp(row.occurredAt)} — ${row.username} in ${this.location(row)} — ${triggered} — ${this.outcome(row)}`;
  }

  /** `guildName #channelName`, or `a DM #channelName` when there is no guild. */
  private location(row: InteractionEventRow): string {
    const place = row.guildName ?? 'a DM';
    return row.channelName === null ? place : `${place} #${row.channelName}`;
  }

  private timestamp(occurredAt: Date): string {
    return `<t:${Math.floor(occurredAt.getTime() / 1000)}:f>`;
  }

  private trigger(row: InteractionEventRow): string {
    return row.kind === 'command' ? `/${row.name}` : `${row.kind} ${row.name}`;
  }

  /** Empty string, not `()`, when nothing was recorded. */
  private parameters(row: InteractionEventRow): string {
    if (row.parameters.length === 0) {
      return '';
    }
    const pairs = row.parameters.map(
      (parameter) =>
        `${parameter.key}: ${parameter.value ?? EMPTY_PARAMETER_VALUE}`,
    );
    return `(${pairs.join(', ')})`;
  }

  /** A failure is not guaranteed to carry a message, so the cross stands alone then. */
  private outcome(row: InteractionEventRow): string {
    if (row.outcome === 'success') {
      return '✅';
    }
    return row.errorMessage === null ? '❌' : `❌ ${row.errorMessage}`;
  }
}
