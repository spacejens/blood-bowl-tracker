import type { UpsertRulesSet } from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

import { createUpsertImportServiceBase } from './upsert-import-service-base';

@Injectable()
export class RulesSetsImportService extends createUpsertImportServiceBase({
  resource: (client) => client.rulesSets,
  buildErrorMessage: (data: UpsertRulesSet, err) =>
    `Failed to import rules set "${data.name}": ${err instanceof Error ? err.message : String(err)}`,
}) {}
