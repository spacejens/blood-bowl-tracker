import { Injectable } from '@nestjs/common';
import { makeImportError } from './types';
import type { ImportError } from './types';

interface UpsertResponse<TBody = unknown> {
  status: number;
  body: TBody;
}

@Injectable()
export class ImportRunnerService {
  async upsertExternalSystem(
    upsert: () => Promise<UpsertResponse<{ id: number }>>,
    name: string,
  ): Promise<number> {
    const response = await upsert();
    if (response.status === 200 || response.status === 201) {
      return response.body.id;
    }
    throw new Error(
      `Failed to upsert external system "${name}": unexpected status ${response.status}`,
    );
  }

  recordUpsert(
    response: UpsertResponse<unknown>,
    item: unknown,
    errors: ImportError[],
    buildErrorMessage: (body: unknown) => string,
  ): boolean {
    if (response.status === 200 || response.status === 201) {
      return true;
    }
    errors.push(
      makeImportError({ item, message: buildErrorMessage(response.body) }),
    );
    return false;
  }
}
