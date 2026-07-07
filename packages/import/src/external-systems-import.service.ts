import { Inject, Injectable } from '@nestjs/common';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { ImportRunnerService } from './import-runner.service';

@Injectable()
export class ExternalSystemsImportService {
  constructor(
    @Inject(API_CLIENT) private readonly client: ApiClient,
    private readonly importRunner: ImportRunnerService,
  ) {}

  upsertExternalSystem(name: string): Promise<number> {
    return this.importRunner.upsertExternalSystem(
      () => this.client.externalSystems.upsert({ name }),
      name,
    );
  }
}
