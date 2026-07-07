import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { ContractRouterClient } from '@orpc/contract';
import { contract } from '@blood-bowl-tracker/api-contract';

export function createApiClient(
  baseUrl: string,
): ContractRouterClient<typeof contract> {
  const link = new RPCLink({ url: `${baseUrl}/rpc` });
  return createORPCClient(link);
}

export type ApiClient = ReturnType<typeof createApiClient>;
