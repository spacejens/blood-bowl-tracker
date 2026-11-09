import type { CompetitionType } from '@blood-bowl-tracker/domain-enums';
import { Injectable } from '@nestjs/common';

/**
 * How each stored competition type reads in deepdive text. A `Record` over
 * the full enum, so adding a competition type fails typechecking here until
 * it is given a label, instead of rendering its raw slug.
 */
const COMPETITION_TYPE_LABELS: Record<CompetitionType, string> = {
  season: 'Season',
  cup: 'Cup',
};

/** Turns a stored competition type into its human-readable label. */
@Injectable()
export class CompetitionTypeLabelService {
  label(type: CompetitionType): string {
    return COMPETITION_TYPE_LABELS[type];
  }
}
