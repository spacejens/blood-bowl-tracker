import type { UpsertRulesSet } from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

import { createUpsertImportServiceBase } from './upsert-import-service-base';

@Injectable()
export class RulesSetsImportService extends createUpsertImportServiceBase({
  resource: (client) => client.rulesSets,
  // A step that only attaches an external id to a curated rules set sends no
  // name, so the rules set is then named by its first external id.
  buildErrorMessage: (data: UpsertRulesSet, err) => {
    const label = data.name ?? data.externalIds.at(0)?.externalId;
    return `Failed to import rules set "${label}": ${err instanceof Error ? err.message : String(err)}`;
  },
}) {}
