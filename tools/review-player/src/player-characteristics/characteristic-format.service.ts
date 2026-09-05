import { Injectable } from '@nestjs/common';

/** How one characteristic is displayed under a rules set. */
export type CharacteristicFormat =
  'absent' | 'bare' | 'plus' | 'plus_zero_legal';

/** What the report shows where there is no characteristic value to show. */
export const NO_CHARACTERISTIC = '—';

/**
 * Renders one of a player's characteristics the way its rules set displays
 * it: a bare number, a roll target with a trailing "+", or nothing at all.
 *
 * Zero is rendered as nothing, unlike the equivalent service in
 * tools/review-race: 0 is never a legal characteristic value under any rules
 * set, in either raw or imported data, so a stored 0 is always the players
 * table's placeholder default rather than a real value, and printing it as
 * "0" would read as a claim the data does not make.
 *
 * Pure and dependency-free, so specs inject it real.
 */
@Injectable()
export class CharacteristicFormatService {
  format(value: number | null, format: CharacteristicFormat): string {
    if (value === null || value === 0 || format === 'absent') {
      return NO_CHARACTERISTIC;
    }
    return format === 'plus' ? `${value}+` : String(value);
  }
}
