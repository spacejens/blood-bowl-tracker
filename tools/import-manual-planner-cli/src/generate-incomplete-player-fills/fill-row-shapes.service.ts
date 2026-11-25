import { Injectable } from '@nestjs/common';

import type {
  CharacteristicFormats,
  CharacteristicLine,
} from './fill-plan.types';
import type { FormatColumns, LineColumns } from './fill-query.types';

/** Turns the columns the fill queries select into the planner's row fields. */
@Injectable()
export class FillRowShapesService {
  line(row: LineColumns): CharacteristicLine {
    return {
      ma: row.move,
      st: row.strength,
      ag: row.agility,
      pa: row.passing,
      av: row.armour,
    };
  }

  formats(row: FormatColumns): CharacteristicFormats {
    return {
      ma: row.moveFormat,
      st: row.strengthFormat,
      ag: row.agilityFormat,
      pa: row.passingFormat,
      av: row.armourFormat,
    };
  }

  /**
   * A match time as an ISO timestamp, the form every row the planner reads
   * carries (it parses them with `Date.parse`). The times read are never
   * null: `played_at` is NOT NULL, and a `min`/`max` over it covers a group
   * that has at least one match.
   */
  iso(value: Date | null): string {
    if (value === null) {
      throw new Error('A match time the query guarantees is missing');
    }
    return value.toISOString();
  }
}
