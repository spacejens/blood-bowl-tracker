import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { CompetitionTypeLabelService } from './competition-type-label.service';

/** Canned label the mock returns for `season`; deliberately not the real one. */
export const STUB_SEASON_LABEL = 'Season label';
/** Canned label the mock returns for `cup`; deliberately not the real one. */
export const STUB_CUP_LABEL = 'Cup label';

/**
 * Test-only helper. Do not import from production code.
 *
 * A fresh `CompetitionTypeLabelService` mock with a canned label per
 * competition type. The labels differ from the real ones so an assertion
 * proves the caller rendered the label service's output rather than its own
 * text; the real mapping is covered by `competition-type-label.service.spec.ts`.
 */
export function makeCompetitionTypeLabel(): MockProxy<CompetitionTypeLabelService> {
  const competitionTypeLabel = mock<CompetitionTypeLabelService>();
  competitionTypeLabel.label
    .calledWith('season')
    .mockReturnValue(STUB_SEASON_LABEL);
  competitionTypeLabel.label.calledWith('cup').mockReturnValue(STUB_CUP_LABEL);
  return competitionTypeLabel;
}
