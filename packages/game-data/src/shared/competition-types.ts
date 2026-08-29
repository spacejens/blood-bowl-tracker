import type { competitionTypeEnum } from '@blood-bowl-tracker/db';

/** A value of the `competition_type` DB enum. */
export type CompetitionType = (typeof competitionTypeEnum.enumValues)[number];
