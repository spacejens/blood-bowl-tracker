import { Injectable } from '@nestjs/common';

/**
 * One mercenary position's characteristics under one rules set. Deliberately
 * the same five fields (and only those) that `position_rules_sets` and a
 * player's own characteristics both carry.
 */
export interface MercenaryCharacteristics {
  move: number;
  strength: number;
  agility: number;
  passing: number;
  armour: number;
}

/**
 * Curated characteristics for mercenary ("Big Guy") hires, keyed by the
 * mercenary position's name (a TP `lineUps[]` entry's inline
 * `fallbackPositionName`) and then by rules-set name.
 *
 * TP supplies no characteristics for these hires anywhere: the name appears in
 * no roster catalog (`lineUpMasters`, `starPlayersMasters`), and the
 * match-embedded `lineUps[]` entry for an actual hire carries no
 * `ma/st/ag/pa/av` either. Without this table both the mercenary Position and
 * every hire of it would be left with no characteristics at all.
 *
 * This is universal Blood Bowl rules data, not installation-specific
 * configuration, so it lives here as tracked source rather than in the
 * gitignored, per-installation `import-tp-config.json5`.
 *
 * Adding a rules set, or a newly-observed mercenary name, is one more entry in
 * the table below — no code change. A mercenary name with no entry at all, or
 * a hire under a rules set this table does not cover, is reported as an
 * `ImportError` by `TpMercenaryCharacteristicsService` rather than silently
 * importing without characteristics.
 */
@Injectable()
export class MercenaryCharacteristicsConfigService {
  /**
   * "Giant Mercenary" / BB2020 matches the `position_rules_sets` row BBL
   * already imports for the Giant Mercenary position (MA 6 / ST 7 / AG 5 /
   * PA 5 / AV 11), which is why the star-player deepdive already shows the
   * correct line for the position while an individual hire's own row does not.
   *
   * BB2025 has no Giant Mercenary at all, so its absence here is intentional,
   * not a gap to fill.
   */
  private readonly byPositionName: ReadonlyMap<
    string,
    ReadonlyMap<string, MercenaryCharacteristics>
  > = new Map([
    [
      'Giant Mercenary',
      new Map([
        [
          'BB2020',
          { move: 6, strength: 7, agility: 5, passing: 5, armour: 11 },
        ],
      ]),
    ],
  ]);

  /**
   * Every curated rules set for one mercenary position, or `undefined` when
   * the position name is not curated at all — the caller reports that as an
   * error, since it means a brand-new mercenary name showed up in the source
   * data and nobody has curated it yet.
   */
  forPosition(
    positionName: string,
  ): ReadonlyMap<string, MercenaryCharacteristics> | undefined {
    return this.byPositionName.get(positionName);
  }

  /**
   * One mercenary position's characteristics under one specific rules set, or
   * `undefined` when the table covers neither the position nor that particular
   * rules set for it.
   */
  forPositionAndRulesSet(options: {
    positionName: string;
    rulesSetName: string;
  }): MercenaryCharacteristics | undefined {
    return this.byPositionName
      .get(options.positionName)
      ?.get(options.rulesSetName);
  }
}
