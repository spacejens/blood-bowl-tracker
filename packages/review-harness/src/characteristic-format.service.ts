import { Injectable } from '@nestjs/common';

/** How one characteristic is displayed under a rules set. */
export type CharacteristicFormat =
  'absent' | 'bare' | 'plus' | 'plus_zero_legal';

/** What a report shows where there is no characteristic value to show. */
export const NO_CHARACTERISTIC = '—';

/**
 * Renders one characteristic the way its rules set displays it: a bare
 * number, a roll target with a trailing "+", or nothing at all for a rules
 * set that has no such characteristic (in practice only Passing, absent from
 * CRP, CRP+ and BB2016).
 *
 * Only `null` or an `absent` format renders as nothing. A stored 0 is printed
 * as the number it is: for Move, Strength, Agility and Armour that means the
 * players table's placeholder default shows itself instead of hiding behind a
 * dash — which is what a review tool is for — and for a `plus_zero_legal`
 * Passing value it is a real value ("structurally cannot pass"), rendered as
 * a bare "0" since "0+" is not a meaningful die-roll target. Any other
 * `plus_zero_legal` value prints exactly as under `plus`.
 *
 * Pure and dependency-free, so specs inject it real.
 */
@Injectable()
export class CharacteristicFormatService {
  format(value: number | null, format: CharacteristicFormat): string {
    if (value === null || format === 'absent') {
      return NO_CHARACTERISTIC;
    }
    if (format === 'plus' || (format === 'plus_zero_legal' && value !== 0)) {
      return `${value}+`;
    }
    return String(value);
  }
}
