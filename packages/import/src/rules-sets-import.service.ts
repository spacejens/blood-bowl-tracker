import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import { Inject, Injectable } from '@nestjs/common';

import { ImportRunnerService } from './import-runner.service';
import type { ImportError } from './types';

export interface UpsertRulesSetData {
  name: string;
  races?: number[];
  externalIds: { externalSystemId: number; externalId: string }[];
}

@Injectable()
export class RulesSetsImportService {
  constructor(
    @Inject(API_CLIENT) private readonly client: ApiClient,
    private readonly importRunner: ImportRunnerService,
  ) {}

  upsertRulesSet(data: UpsertRulesSetData, errors: ImportError[]) {
    return this.importRunner.recordUpsertResult(
      () => this.client.rulesSets.upsert(data),
      data,
      errors,
      (err) =>
        `Failed to import rules set "${data.name}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
