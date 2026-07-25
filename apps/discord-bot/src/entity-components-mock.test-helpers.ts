import { ButtonStyle, ComponentType } from 'discord.js';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { EntityComponentsService } from './entity-components.service';

/**
 * An `EntityComponentsService` mock canned to echo its entries back as a
 * single button action row, with no overflow note. It does NOT reproduce the
 * real dedupe/cap/chunk/select logic — that is covered by
 * `entity-components.service.spec.ts`. This neutral stand-in exists only so a
 * consumer's own entry-composition logic can be exercised on the entries a
 * test supplies.
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
