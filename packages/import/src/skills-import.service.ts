import type { UpsertSkill } from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

import { createUpsertImportServiceBase } from './upsert-import-service-base';

/**
 * A skill is a bare name; its category lives on the skill x rules-set
 * association (see SkillRulesSetsImportService), so there is nothing to
 * upsert here beyond the name and its external ids.
 */
@Injectable()
export class SkillsImportService extends createUpsertImportServiceBase({
  resource: (client) => client.skills,
  buildErrorMessage: (data: UpsertSkill, err) =>
    `Failed to import skill "${data.name}": ${err instanceof Error ? err.message : String(err)}`,
}) {}
