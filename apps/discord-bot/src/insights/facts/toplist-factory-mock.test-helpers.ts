import type { Mock } from 'vitest';
import { vi } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type {
  CountedRow,
  MakeResolversOptions,
} from './toplist-factory.service';
import { ToplistFactoryService } from './toplist-factory.service';

export interface ToplistFactoryMock<
  TMethod extends string,
  TRow extends CountedRow,
> {
  /** The provider to hand to Test.createTestingModule. */
  factory: MockProxy<ToplistFactoryService>;
  /** The options object the service under test passed to makeResolvers. */
  options: () => MakeResolversOptions<TMethod, TRow>;
  /** The canned resolver handed back for one titles entry. */
  resolver: (method: TMethod) => Mock;
}

/**
 * A `ToplistFactoryService` mock canned to hand back one inert `vi.fn()`
 * resolver per titles entry, and to record the options it was called with.
 * It does NOT reproduce the real binding of each resolver to
 * `LeaderboardService.resolveToplist` — that is covered by
 * `toplist-factory.service.spec.ts`. This stand-in exists only so a
 * consumer's own wiring (its titles table, entityLink, decorateRows and
 * formatRow hooks) and its delegation to the right resolver can be asserted
 * without depending on the factory's concrete behavior.
 *
 * Test-only. Do not import from production code.
 */
export function mockToplistFactory<
  TMethod extends string,
  TRow extends CountedRow,
>(cannedReply: unknown = 'canned'): ToplistFactoryMock<TMethod, TRow> {
  const factory = mock<ToplistFactoryService>();
  let captured: MakeResolversOptions<TMethod, TRow> | undefined;
  const resolvers = new Map<TMethod, Mock>();
  (factory.makeResolvers as unknown as Mock).mockImplementation(
    (options: MakeResolversOptions<TMethod, TRow>) => {
      captured = options;
      const built: Record<string, Mock> = {};
      for (const method of Object.keys(options.titles) as TMethod[]) {
        const resolver = vi.fn().mockResolvedValue(cannedReply);
        resolvers.set(method, resolver);
        built[method] = resolver;
      }
      return built;
    },
  );
  return {
    factory,
    options: () => {
      if (captured === undefined) {
        throw new Error('makeResolvers was never called');
      }
      return captured;
    },
    resolver: (method) => {
      const resolver = resolvers.get(method);
      if (resolver === undefined) {
        throw new Error(`no resolver was built for ${method}`);
      }
      return resolver;
    },
  };
}
