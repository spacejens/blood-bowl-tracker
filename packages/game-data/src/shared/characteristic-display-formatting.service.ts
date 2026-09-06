import type { CharacteristicFormat } from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

/**
 * What a characteristic renders as when there is no number to show. Two
 * different situations collapse to this one marker, on purpose:
 *
 * - `null` — the value genuinely is not there to show.
 * - `0` — either a stale legacy value for Move, Strength, Agility or Armour
 *   (0 is not a legal value for any of them under any rules set — see the
 *   characteristic comments on `players` and `position_rules_sets` in the
 *   schema), or, for a `plus_zero_legal` Passing value, a real value meaning
 *   "structurally cannot pass". Discord shows
 *   that real zero as a dash too, deliberately: a bare "0" reads oddly to
 *   players. The review tools under tools/ do print it, since their job is
 *   to expose exactly what the data says.
 */
const NO_VALUE = '—';

/**
 * Renders one stored characteristic value the way its rules set declares it.
 *
 * Pure and dependency-free: it is a display decision over two inputs, with no
 * I/O and no external state, so specs for services that use it may pass it as
 * a real collaborator (see CLAUDE.md's formatting-service testing carve-out).
 *
 * Deliberately named and placed generically rather than `Position`-prefixed:
 * a position's per-rules-set characteristics and a player's own current
 * characteristics are the same `{value, format}` pair, so both render through
 * this one service.
 *
 * The caller is responsible for `characteristicFormat === 'absent'`: a rules
 * set with no such characteristic omits the field entirely rather than
 * rendering a placeholder for it, so this service is never called with
 * `'absent'` and does not special-case it.
 */
@Injectable()
export class CharacteristicDisplayFormattingService {
  format(
    value: number | null,
    characteristicFormat: CharacteristicFormat,
  ): string {
    if (value === null || value === 0) {
      return NO_VALUE;
    }
    if (
      characteristicFormat === 'plus' ||
      characteristicFormat === 'plus_zero_legal'
    ) {
      return `${value}+`;
    }
    return String(value);
  }
}
