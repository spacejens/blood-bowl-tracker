import { ButtonStyle, ComponentType } from 'discord.js';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { EntityComponentsService } from './entity-components.service';

/**
 * An `EntityComponentsService` mock canned to echo its entries back as a
 * single button action row, with no overflow note. It does NOT reproduce the
 * real dedupe/cap/chunk/select logic — that is covered by
 * `entity-components.service.spec.ts`. Nor does it reproduce the real
 * per-destination-type button colouring: every button here is
 * `ButtonStyle.Primary` whatever its customId prefix, an arbitrary constant
 * with no significance. Consumer specs using this stub assert `style` with
 * `expect.any(Number)` rather than a specific `ButtonStyle`, since they are
 * testing their own service's entry-composition logic (labels, custom ids,
 * grouping), not button colour.
 *
 * This neutral stand-in exists only so a consumer's own entry-composition
 * logic can be exercised on the entries a test supplies.
 *
 * Test-only. Do not import from production code.
 */
export function passthroughEntityComponents(): MockProxy<EntityComponentsService> {
  const entityComponents = mock<EntityComponentsService>();
  entityComponents.buildEntityComponents.mockImplementation((entries) => ({
    components:
      entries.length === 0
        ? []
        : [
            {
              type: ComponentType.ActionRow,
              components: entries.map((entry) => ({
                type: ComponentType.Button as const,
                style: ButtonStyle.Primary as const,
                label: entry.label,
                custom_id: `${entry.customIdPrefix}${entry.entityId}`,
              })),
            },
          ],
    overflowNote: null,
  }));
  return entityComponents;
}

/**
 * An `EntityComponentsService` mock canned to always return no components and
 * no overflow note, regardless of the entries it's given. This is the default
 * stub for specs whose description-rendering tests don't need to configure a
 * component return value at all — they just need `buildEntityComponents` to
 * resolve to something.
 *
 * Test-only. Do not import from production code.
 */
export function nullEntityComponents(): MockProxy<EntityComponentsService> {
  const entityComponents = mock<EntityComponentsService>();
  entityComponents.buildEntityComponents.mockReturnValue({
    components: [],
    overflowNote: null,
  });
  return entityComponents;
}
