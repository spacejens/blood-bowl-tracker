import { Injectable } from '@nestjs/common';

import type { TpOfficialKeywordCatalog } from './tp-official-keyword-catalog.service';

/** Hatred's own skillMasterId. */
export const HATRED_SKILL_MASTER_ID = 307;
/** Animosity's own skillMasterId. */
export const ANIMOSITY_SKILL_MASTER_ID = 269;

/** Options for {@link TpKeywordTargetDecoderService.decode}. */
export interface DecodeKeywordTargetOptions {
  skillMasterId: number;
  /** The skill reference's type-3 attribute value: an opaque keyword code. */
  attributeValue: string;
  catalog: TpOfficialKeywordCatalog;
}

/**
 * The keyword a Hatred or Animosity skill names as its target. TP writes the
 * target as a type-3 attribute value: an opaque numeric keyword code from the
 * same id space as a position's own keywords, named nowhere in TP's data --
 * only the curated keyword catalogue names it. Shared by the official team
 * list's starting skills and a roster player's own skills. Constructor-free,
 * pure decision logic, so specs may pass it as a real provider.
 */
@Injectable()
export class TpKeywordTargetDecoderService {
  /**
   * The target keyword's name, or undefined for any other skill, a value
   * that is not an integer code, or a code the catalogue does not carry.
   */
  decode({
    skillMasterId,
    attributeValue,
    catalog,
  }: DecodeKeywordTargetOptions): string | undefined {
    if (
      skillMasterId !== HATRED_SKILL_MASTER_ID &&
      skillMasterId !== ANIMOSITY_SKILL_MASTER_ID
    ) {
      return undefined;
    }
    const code = Number(attributeValue);
    if (!Number.isInteger(code)) {
      return undefined;
    }
    return catalog.byCode.get(code)?.name;
  }
}
