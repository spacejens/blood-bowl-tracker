import { ButtonStyle, ComponentType } from 'discord.js';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { EntityComponentsService } from './entity-components.service';

/**
 * The emoji every button from `passthroughEntityComponents()` carries. Like the
 * stub's `ButtonStyle.Primary`, it is an arbitrary constant with no
 * significance — the real per-destination-type emoji mapping is covered by
 * `entity-components.service.spec.ts`. Consumer specs assert against this
 * constant so their expectations stay honest about not testing emoji choice.
 *
 * Test-only. Do not import from production code.
 */
export const STUB_BUTTON_EMOJI = { name: '❓' } as const;

/**
 * An `EntityComponentsService` mock canned to echo its entries back as a
 * single button action row, with no overflow note. It does NOT reproduce the
 * real dedupe/cap/chunk/select logic — that is covered by
 * `entity-components.service.spec.ts`. Nor does it reproduce the real
 * per-destination-type button colouring or emoji: every button here is
 * `ButtonStyle.Primary` with `STUB_BUTTON_EMOJI`, whatever its customId
 * prefix, both arbitrary constants with no significance. Consumer specs using
 * this stub assert `style` with `expect.any(Number)` and `emoji` with
 * `STUB_BUTTON_EMOJI`, since they are testing their own service's
 * entry-composition logic (labels, custom ids, grouping), not button
 * decoration.
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
                emoji: STUB_BUTTON_EMOJI,
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
