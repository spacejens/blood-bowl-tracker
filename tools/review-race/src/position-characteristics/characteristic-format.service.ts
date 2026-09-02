import { Injectable } from '@nestjs/common';

import type { CharacteristicFormat } from '../shared/race-positions-query.service';

/** What the report shows for a value the rules set does not have. */
const NONE = '—';

/**
 * Renders one characteristic the way its rules set displays it: a bare
 * number, a roll target with a trailing "+", or nothing at all for a rules
 * set that has no such characteristic (in practice only Passing, absent from
 * CRP, CRP+ and BB2016). Pure and dependency-free, so specs inject it real.
 */
@Injectable()
export class CharacteristicFormatService {
  format(value: number | null, format: CharacteristicFormat): string {
    if (value === null || format === 'absent') {
      return NONE;
    }
    return format === 'plus' ? `${value}+` : String(value);
  }
}
