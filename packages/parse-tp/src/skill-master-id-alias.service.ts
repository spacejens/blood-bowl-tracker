import { Injectable } from '@nestjs/common';

/**
 * A handful of TP `skillMasterId`s carry no embedded name in any downloaded
 * mirror file -- `SkillMasterNameCollectionService`'s scan can never learn
 * them from data, however much history is downloaded. This map is a
 * HARD-CODED alias from such an id to the skill name it actually means,
 * each confirmed against TP's own UI by the developer; it is documented in
 * docs/import-tp/index.md, "Hard-coded TP lookups".
 *
 * Most entries here are TP assigning a *new* id to a skill already known
 * under a different id for another rules set (e.g. `181` is BB2020's id for
 * "Loner", which BB2025 already names directly elsewhere) -- these need no
 * further curation, since the skill they alias to is already curated.
 * `Punt` and `Fumblerooski` are genuinely new to the curated catalogue and
 * were curated alongside this table.
 *
 * Exported for `skill-master-id-alias.service.spec.ts`, so its decode tests
 * are driven directly off this map (every known id gets a test case, with
 * no risk of the two lists drifting apart).
 */
export const skillMasterIdAliasById: Record<number, string> = {
  166: 'Swarming',
  181: 'Loner',
  210: 'Fumblerooski',
  238: 'Iron Hard Skin',
  246: 'Cloud Burster',
  254: 'Punt',
  304: 'Trickster',
  305: 'My Ball',
  306: 'Breathe Fire',
};

@Injectable()
export class SkillMasterIdAliasService {
  /** The aliased skill name for one skillMasterId, or `undefined` when the
   * table cannot explain it. */
  decode(skillMasterId: number): string | undefined {
    return skillMasterIdAliasById[skillMasterId];
  }
}
