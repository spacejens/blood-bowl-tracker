import type { UpsertPlayer } from '@blood-bowl-tracker/api-contract';
import { PLAYER_CHARACTERISTIC_KEYS } from '@blood-bowl-tracker/api-contract';
import type { Db } from '@blood-bowl-tracker/db';
import { DB, eq, rulesSets } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { CharacteristicFormatMismatchError } from '../shared/characteristic-format-mismatch-error';
import type { CharacteristicValues } from '../shared/characteristic-format-validation.service';
import { CharacteristicFormatValidationService } from '../shared/characteristic-format-validation.service';

/**
 * The characteristics half of `players.upsert`'s input validation: reject a
 * partial line, reject a line with no rules set to validate it against, and
 * reject values that disagree with the rules set's declared display formats —
 * all before any write happens.
 *
 * Its own service rather than private methods on `PlayersService`, which sits
 * at the repo's 500-line source ceiling. The split is also the natural one:
 * nothing here touches the `players` table, only `rules_sets`.
 */
@Injectable()
export class PlayerCharacteristicsValidationService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly characteristicFormats: CharacteristicFormatValidationService,
  ) {}

  /**
   * Nothing is stored about which rules set was used: `rulesSetId` addresses
   * the validation, not the row.
   *
   * The contract's `UpsertPlayerSchema` already guarantees the all-or-nothing
   * pairing at the RPC boundary, but `PlayersService` is also called
   * directly, so a half-specified payload is refused here rather than written
   * as an unvalidated partial line.
   */
  async validate(data: UpsertPlayer): Promise<void> {
    const supplied = PLAYER_CHARACTERISTIC_KEYS.filter(
      (key) => data[key] !== undefined,
    );
    if (
      supplied.length > 0 &&
      supplied.length < PLAYER_CHARACTERISTIC_KEYS.length
    ) {
      throw new CharacteristicFormatMismatchError(
        `Characteristics are all-or-nothing: a partial characteristic line was supplied for ${this.playerSubject(data)} — supply every one of ${PLAYER_CHARACTERISTIC_KEYS.join(', ')} or none`,
      );
    }

    const values = this.characteristicValues(data);
    if (values === undefined) {
      if (data.rulesSetId !== undefined) {
        throw new CharacteristicFormatMismatchError(
          `Rules set ${data.rulesSetId} was supplied for ${this.playerSubject(data)} without a complete set of characteristics`,
        );
      }
      return;
    }
    if (data.rulesSetId === undefined) {
      throw new CharacteristicFormatMismatchError(
        `Characteristics were supplied for ${this.playerSubject(data)} without a rules set to validate them against`,
      );
    }

    const [formats] = await this.db
      .select({
        moveFormat: rulesSets.moveFormat,
        strengthFormat: rulesSets.strengthFormat,
        agilityFormat: rulesSets.agilityFormat,
        passingFormat: rulesSets.passingFormat,
        armourFormat: rulesSets.armourFormat,
      })
      .from(rulesSets)
      .where(eq(rulesSets.id, data.rulesSetId));

    this.characteristicFormats.validate({
      values,
      formats,
      rulesSetId: data.rulesSetId,
      subject: this.playerSubject(data),
    });
  }

  /**
   * The payload's complete characteristic line, or undefined when it carries
   * no complete one. `passing: null` counts as supplied — it asserts that the
   * rules set has no Passing characteristic.
   */
  private characteristicValues(
    data: UpsertPlayer,
  ): CharacteristicValues | undefined {
    const { move, strength, agility, passing, armour } = data;
    if (
      move === undefined ||
      strength === undefined ||
      agility === undefined ||
      passing === undefined ||
      armour === undefined
    ) {
      return undefined;
    }
    return { move, strength, agility, passing, armour };
  }

  /**
   * Names the player in a validation message. The row may not exist yet, so
   * the first external id is the only stable identifier available — and it is
   * the one the importer reporting the failure recognizes.
   */
  private playerSubject(data: UpsertPlayer): string {
    const [first] = data.externalIds;
    return `player ${first.externalSystemId}:${first.externalId}`;
  }
}
