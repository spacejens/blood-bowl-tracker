import { initClient } from '@ts-rest/core';
import { contract } from '@blood-bowl-tracker/api-contract';

export function createApiClient(baseUrl: string) {
  return initClient(contract, {
    baseUrl,
    baseHeaders: {},
  });
}

export type ApiClient = ReturnType<typeof createApiClient>;
