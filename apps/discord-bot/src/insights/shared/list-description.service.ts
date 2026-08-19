import { Injectable } from '@nestjs/common';

import { MAX_DESCRIPTION_LENGTH } from '../../description-limits';

/**
 * Builds the embed `description` for the list-style insights facts (star
 * players, eras, trophies, competition groups) from their already-formatted
 * lines, truncating within Discord's `MAX_DESCRIPTION_LENGTH` — a hard
 * per-field cap; exceeding it rejects the whole interaction, not just this
 * field — while always preserving `EntityComponentsService`'s overflow note in
 * full. A plain end-of-string truncation would risk cutting the note itself
 * off exactly when it matters most: a catalog long enough to need one.
 *
 * These facts have no row cap of their own (and `starPlayers.list` can never
 * even be narrowed by a league scope), so this is the only thing standing
 * between a growing catalog and a rejected interaction.
 */
@Injectable()
export class ListDescriptionService {
  build(lines: string[], overflowNote: string | null): string {
    if (overflowNote === null) {
      return this.truncate(lines.join('\n'), MAX_DESCRIPTION_LENGTH);
    }
    const linesBudget = MAX_DESCRIPTION_LENGTH - overflowNote.length - 1;
    return `${this.truncate(lines.join('\n'), linesBudget)}\n${overflowNote}`;
  }

  /** Mirrors `StarPlayerDeepdiveService.enforceDescriptionLimit`. */
  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return `${text.slice(0, maxLength - 1)}…`;
  }
}
