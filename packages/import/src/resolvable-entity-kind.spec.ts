import { contract } from '@blood-bowl-tracker/api-contract';
import { describe, expect, it } from 'vitest';

import { RESOLVABLE_ENTITY_KINDS } from './resolvable-entity-kind';

/**
 * The contract namespace each resolvable kind maps to. Mirrors
 * ExternalIdResolverService.routerFor exactly -- kept as a separate literal
 * mapping (rather than importing that private dispatch) so this test fails
 * loudly if the two ever drift, instead of trivially passing because it
 * shares the same table.
 */
const CONTRACT_NAMESPACE_BY_KIND = {
  coach: 'coaches',
  competition: 'competitions',
  competitionGroup: 'competitionGroups',
  era: 'eras',
  league: 'leagues',
  position: 'positions',
  race: 'races',
  rulesSet: 'rulesSets',
  team: 'teams',
} as const satisfies Record<(typeof RESOLVABLE_ENTITY_KINDS)[number], string>;

describe('RESOLVABLE_ENTITY_KINDS contract parity', () => {
  it.each(RESOLVABLE_ENTITY_KINDS)(
    '%s has a resolve/resolveBatch procedure in the api-contract',
    (kind) => {
      const namespace =
        contract[CONTRACT_NAMESPACE_BY_KIND[kind] as keyof typeof contract];

      expect(namespace).toHaveProperty('resolve');
      expect(namespace).toHaveProperty('resolveBatch');
    },
  );
});
