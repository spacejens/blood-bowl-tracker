import type { CharacteristicFormat } from '@blood-bowl-tracker/domain-enums';
import { Injectable } from '@nestjs/common';

import type {
  CharacteristicFormats,
  CharacteristicLine,
} from './fill-plan.types';

export interface ValidityInput {
  line: CharacteristicLine;
  formats: CharacteristicFormats;
}

/** The worst die-roll target a target-number characteristic can have. */
const WORST_TARGET = 6;

/**
 * Decides whether a position's characteristic line is one a fill can write.
 * MA, ST and AV must be at least 1. AG and PA follow the rules set's format:
 * a bare value must be at least 1, a target number ("3+") must be 1+ to 6+,
 * and 0 is allowed only where the format makes it a legal structural zero.
 * Passing must be present exactly when the rules set has it.
 *
 * Pure decision logic, with no I/O and no dependencies.
 */
@Injectable()
export class CharacteristicValidityService {
  isValid(input: ValidityInput): boolean {
    const { line, formats } = input;
    if (line.ma < 1 || line.st < 1 || line.av < 1) {
      return false;
    }
    if (!this.validScored(line.ag, formats.ag)) {
      return false;
    }
    if (formats.pa === 'absent') {
      return line.pa === null;
    }
    return line.pa !== null && this.validScored(line.pa, formats.pa);
  }

  private validScored(value: number, format: CharacteristicFormat): boolean {
    if (format === 'absent') {
      return false;
    }
    if (format === 'bare') {
      return value >= 1;
    }
    if (value === 0) {
      return format === 'plus_zero_legal';
    }
    return value >= 1 && value <= WORST_TARGET;
  }
}
