import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type { UpsertRulesSet } from '@blood-bowl-tracker/api-contract';
import { Inject, Injectable } from '@nestjs/common';

import { ImportRunnerService } from './import-runner.service';
import type { ImportError } from './types';

@Injectable()
export class RulesSetsImportService {
  constructor(
    @Inject(API_CLIENT) private readonly client: ApiClient,
    private readonly importRunner: ImportRunnerService,
  ) {}

  upsertRulesSet(data: UpsertRulesSet, errors: ImportError[]) {
    return this.importRunner.recordUpsertResult({
      upsert: () => this.client.rulesSets.upsert(data),
      item: data,
      errors,
      buildErrorMessage: (err) =>
        `Failed to import rules set "${data.name}": ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
