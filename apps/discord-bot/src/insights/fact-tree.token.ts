/**
 * DI token for the pre-built `/insights` fact tree. Provided by
 * `InsightsModule` via a `useFactory` over `FactTreeFactoryService`, and
 * injected wherever the resolved `FactNode` is needed.
 */
export const FACT_TREE = Symbol('FACT_TREE');
