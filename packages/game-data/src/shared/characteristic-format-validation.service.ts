import type { CharacteristicFormat } from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

import { CharacteristicFormatMismatchError } from './characteristic-format-mismatch-error';

/** The rules set's five format columns, as loaded for validation. */
export interface RulesSetFormats {
  moveFormat: CharacteristicFormat;
  strengthFormat: CharacteristicFormat;
  agilityFormat: CharacteristicFormat;
  passingFormat: CharacteristicFormat;
  armourFormat: CharacteristicFormat;
}

/** One complete characteristic line, whoever it belongs to. */
export interface CharacteristicValues {
  move: number;
  strength: number;
  agility: number;
  passing: number | null;
  armour: number;
}

/**
 * The five characteristics, each paired with the rules-set column declaring
 * its format and the human-readable name used in error messages. Iterating
 * this list is what keeps validation exhaustive: a sixth characteristic means
 * one more line here, not five more branches.
 */
export const CHARACTERISTICS = [
  { key: 'move', format: 'moveFormat', label: 'Move' },
  { key: 'strength', format: 'strengthFormat', label: 'Strength' },
  { key: 'agility', format: 'agilityFormat', label: 'Agility' },
  { key: 'passing', format: 'passingFormat', label: 'Passing' },
  { key: 'armour', format: 'armourFormat', label: 'Armour' },
] as const satisfies readonly {
  key: keyof CharacteristicValues;
  format: keyof RulesSetFormats;
  label: string;
}[];

/**
 * The single place enforcing "characteristics must match what the rules set
 * declares". Pure and dependency-free: it takes the already-loaded formats
 * rather than reading them, so both writers of characteristics — positions
 * (per rules set) and players (one current line) — apply the identical rule
 * without either re-implementing it.
 */
@Injectable()
export class CharacteristicFormatValidationService {
  /**
   * Throw unless `values` agrees with `formats`: an `absent` format requires
   * the value to be null, and any other format requires a number. `formats`
   * being `undefined` means the rules set does not exist, which is itself a
   * rejection. `subject` names the thing being written (e.g. `position 3`,
   * `player 1:12345`) so the message points at the offending entry.
   */
  validate(options: {
    values: CharacteristicValues;
    formats: RulesSetFormats | undefined;
    rulesSetId: number;
    subject: string;
  }): void {
    const { values, formats, rulesSetId, subject } = options;
    if (formats === undefined) {
      throw new CharacteristicFormatMismatchError(
        `Rules set ${rulesSetId} does not exist, so ${subject} cannot have characteristics under it`,
      );
    }
    for (const characteristic of CHARACTERISTICS) {
      const value = values[characteristic.key];
      const format = formats[characteristic.format];
      if (format === 'absent' && value !== null) {
        throw new CharacteristicFormatMismatchError(
          `Rules set ${rulesSetId} has no ${characteristic.label} characteristic, but ${subject} supplies one`,
        );
      }
      if (format !== 'absent' && value === null) {
        throw new CharacteristicFormatMismatchError(
          `Rules set ${rulesSetId} requires a ${characteristic.label} characteristic, but ${subject} supplies none`,
        );
      }
    }
  }
}
