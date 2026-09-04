import type { CharacteristicFormat } from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

/**
 * What a characteristic with no usable value renders as. A stored zero is
 * always a not-yet-curated placeholder (see the `DEFAULT 0` note on
 * `players`/`position_rules_sets` in the schema): zero is not a legal value
 * for any characteristic under any rules set, so it can never be shown as a
 * number. `null` is treated the same way — the value is not there to show.
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
    return characteristicFormat === 'plus' ? `${value}+` : String(value);
  }
}
