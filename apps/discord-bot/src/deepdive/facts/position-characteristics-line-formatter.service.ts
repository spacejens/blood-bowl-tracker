import type { PositionCharacteristics } from '@blood-bowl-tracker/game-data';
import { CharacteristicDisplayFormattingService } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';

/**
 * Renders one position's stat line under one rules set, using *that rules
 * set's own* declared display formats rather than a single uniform style:
 * how a position's characteristics differ between rules sets is exactly what
 * the views built on this exist to show, so flattening them would hide the
 * point.
 *
 * A rules set whose Passing characteristic is `absent` omits the field
 * entirely rather than printing a placeholder — the characteristic does not
 * exist there, which is different from existing and being unknown.
 *
 * Shared by the position deepdive and the star player deepdive: a star is
 * stored as a `positions` row, so its characteristics are the same shape and
 * must read identically in both views.
 */
@Injectable()
export class PositionCharacteristicsLineFormatterService {
  constructor(
    private readonly characteristics: CharacteristicDisplayFormattingService,
  ) {}

  /** `BB2020: MA 7 ST 3 AG 3+ PA 4+ AV 9+`. */
  formatLine(row: PositionCharacteristics): string {
    const fields = [
      `MA ${this.characteristics.format(row.move, row.moveFormat)}`,
      `ST ${this.characteristics.format(row.strength, row.strengthFormat)}`,
      `AG ${this.characteristics.format(row.agility, row.agilityFormat)}`,
      // A rules set without a Passing characteristic drops the field rather
      // than showing a placeholder: it does not exist there at all.
      ...(row.passingFormat === 'absent'
        ? []
        : [
            `PA ${this.characteristics.format(row.passing, row.passingFormat)}`,
          ]),
      `AV ${this.characteristics.format(row.armour, row.armourFormat)}`,
    ];
    return `${row.rulesSetName}: ${fields.join(' ')}`;
  }
}
