import { contract } from '@blood-bowl-tracker/api-contract';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { ContractRouterClient } from '@orpc/contract';

type Client = ContractRouterClient<typeof contract>;

export function createApiClient(baseUrl: string, apiToken: string): Client {
  const link = new RPCLink({
    url: `${baseUrl}/rpc`,
    // The api-server rejects any /rpc request without a matching bearer token
    // (see docs/api/rpc-conventions.md). RPCLink's `headers` option accepts
    // either a static value or a function returning one; a function is used
    // here to build the Authorization header from the captured `apiToken`.
    headers: () => ({ Authorization: `Bearer ${apiToken}` }),
  });
  const client: Client = createORPCClient(link);

  // The oRPC client is a Proxy that turns ANY property access — including
  // `then` and the NestJS lifecycle-hook names — into a callable RPC procedure.
  // Registered directly as a NestJS provider that breaks startup two ways: the
  // live `then` makes the value look thenable, so Nest awaits it and fires a
  // bogus `then` RPC; and lifecycle scanning finds callable `onModuleInit`,
  // `onApplicationBootstrap`, etc. and invokes them as procedures
  // (`POST /rpc/onModuleInit`). Against a real server those hit unknown
  // procedures and 404, aborting the application. Exposing only the real
  // contract routers on a plain object gives the provider no incidental
  // thenable or lifecycle behaviour while every real procedure keeps working
  // through the underlying client sub-proxies.
  const wrapper: Record<string, unknown> = {};
  for (const routerName of Object.keys(contract)) {
    wrapper[routerName] = (client as Record<string, unknown>)[routerName];
  }
  return wrapper as Client;
}

export type ApiClient = ReturnType<typeof createApiClient>;
