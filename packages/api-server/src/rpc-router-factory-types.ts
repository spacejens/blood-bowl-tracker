import {
  contract,
  type ExternalId,
  type ResolveResult,
} from '@blood-bowl-tracker/api-contract';

/**
 * Every entity's resolve procedure is built by the same resolveProcedure()
 * helper in packages/api-contract, so they are all this one type; coaches is
 * simply the representative the alias is taken from.
 */
export type ResolveProcedure = (typeof contract.coaches)['resolve'];

/** The batch counterpart, likewise identical across every entity. */
export type ResolveBatchProcedure = (typeof contract.coaches)['resolveBatch'];

/** The two members a game-data entity service exposes for external-id lookup. */
export interface ResolvableService {
  resolve(externalId: ExternalId): Promise<ResolveResult>;
  resolveBatch(externalIds: readonly ExternalId[]): Promise<ResolveResult[]>;
}

/** Options for RpcRouterFactoryService.buildResolveRoute. */
export interface ResolveRouteOptions {
  procedure: ResolveProcedure;
  service: Pick<ResolvableService, 'resolve'>;
}

/** Options for RpcRouterFactoryService.buildResolveBatchRoute. */
export interface ResolveBatchRouteOptions {
  procedure: ResolveBatchProcedure;
  service: Pick<ResolvableService, 'resolveBatch'>;
}
