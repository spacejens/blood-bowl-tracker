import { createORPCClient } from '@orpc/client';
import { OpenAPILink } from '@orpc/openapi-client/fetch';
import type { JsonifiedClient } from '@orpc/openapi-client';
import type { ContractRouterClient } from '@orpc/contract';
import { contract } from '@blood-bowl-tracker/api-contract';

export function createApiClient(
  baseUrl: string,
): JsonifiedClient<ContractRouterClient<typeof contract>> {
  const link = new OpenAPILink(contract, { url: baseUrl });
  return createORPCClient(link);
}

export type ApiClient = ReturnType<typeof createApiClient>;
