import type { ApiClient } from '@blood-bowl-tracker/api-client';
import { API_CLIENT } from '@blood-bowl-tracker/api-client';
import type {
  ExternalId,
  ResolveResult,
} from '@blood-bowl-tracker/api-contract';
import { Inject, Injectable } from '@nestjs/common';

import type { ResolvableEntityKind } from './resolvable-entity-kind';

/**
 * The two procedures every resolvable contract namespace has in common.
 * Declaring the shape explicitly (rather than letting the return type be a
 * union of nine whole namespaces) keeps the dispatch below readable and
 * makes the compiler check that each namespace really does expose them.
 */
interface ResolvableRouter {
  resolve: (input: ExternalId) => Promise<ResolveResult>;
  resolveBatch: (input: ExternalId[]) => Promise<ResolveResult[]>;
}

/**
 * Resolves an external-id pair to a database id over the API, for any of the
 * nine resolvable entity kinds.
 *
 * Shared by every import tool. Because each upsert persists immediately, an
 * entity created earlier — in this run, in the other import-manual phase, or
 * by a different import tool — is already resolvable here, so resolution is
 * never limited to what one process has seen.
 *
 * A miss is `undefined`, never an exception: recording an import error and
 * skipping the entry is the caller's decision (see ReferenceLookupService).
 */
@Injectable()
export class ExternalIdResolverService {
  constructor(@Inject(API_CLIENT) private readonly client: ApiClient) {}

  private routerFor(kind: ResolvableEntityKind): ResolvableRouter {
    switch (kind) {
      case 'coach':
        return this.client.coaches;
      case 'competition':
        return this.client.competitions;
      case 'competitionGroup':
        return this.client.competitionGroups;
      case 'era':
        return this.client.eras;
      case 'league':
        return this.client.leagues;
      case 'position':
        return this.client.positions;
      case 'race':
        return this.client.races;
      case 'rulesSet':
        return this.client.rulesSets;
      case 'team':
        return this.client.teams;
    }
  }

  async resolve(
    kind: ResolvableEntityKind,
    ref: ExternalId,
  ): Promise<number | undefined> {
    const result = await this.routerFor(kind).resolve(ref);
    return result.found ? result.id : undefined;
  }

  /**
   * Resolve a whole list in one round trip, answering index-aligned with
   * `refs`. An empty list short-circuits: the contract requires a non-empty
   * array, and there is nothing to ask about anyway.
   */
  async resolveBatch(
    kind: ResolvableEntityKind,
    refs: readonly ExternalId[],
  ): Promise<(number | undefined)[]> {
    if (refs.length === 0) {
      return [];
    }
    const results = await this.routerFor(kind).resolveBatch([...refs]);
    return results.map((result) => (result.found ? result.id : undefined));
  }
}
