/**
 * DI token for the pre-built oRPC router. Provided by `ApiServerModule` via a
 * `useFactory` over `RpcRouterFactoryService`, and injected by `RpcMiddleware`
 * instead of it composing the router from the twelve entity services itself.
 */
export const RPC_ROUTER = Symbol('RPC_ROUTER');
