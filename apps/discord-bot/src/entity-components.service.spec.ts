import { Test } from '@nestjs/testing';
import { ButtonStyle, ComponentType } from 'discord.js';
import { beforeEach, describe, expect, it } from 'vitest';

import type { ButtonCustomIdPrefix } from './deepdive/button-custom-ids';
import type {
  EntityButtonRow,
  EntityComponentEntry,
  EntitySelectRow,
} from './entity-components.service';
import { EntityComponentsService } from './entity-components.service';

const TEAM = 'deepdive:team:';
const ERA = 'deepdive:era:';

function entries(
  count: number,
  customIdPrefix: ButtonCustomIdPrefix = TEAM,
  firstId = 1,
): EntityComponentEntry[] {
  return Array.from({ length: count }, (unused, index) => ({
    customIdPrefix,
    entityId: String(firstId + index),
    label: `Entity ${firstId + index}`,
  }));
}

/** Discord rejects an empty label; a zero-width space renders as blank but validates. */
const BLANK_LABEL = '\u200b';

describe('EntityComponentsService', () => {
  let service: EntityComponentsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [EntityComponentsService],
    }).compile();
    service = moduleRef.get(EntityComponentsService);
  });

  it('returns no components and no note for an empty entry list', () => {
    expect(service.buildEntityComponents([])).toEqual({
      components: [],
      overflowNote: null,
    });
  });

  it('renders buttons chunked five per action row', () => {
    const { components, overflowNote } = service.buildEntityComponents(
      entries(7),
    );
    expect(overflowNote).toBeNull();
    expect(components).toHaveLength(2);
    const [first, second] = components as EntityButtonRow[];
    expect(first.type).toBe(ComponentType.ActionRow);
    expect(first.components).toHaveLength(5);
    expect(second.components).toHaveLength(2);
    expect(first.components[0]).toEqual({
      type: ComponentType.Button,
      style: ButtonStyle.Primary,
      label: 'Entity 1',
      custom_id: 'deepdive:team:1',
    });
  });

  it('drops duplicate entries, keeping the first occurrence', () => {
    const { components } = service.buildEntityComponents([
      { customIdPrefix: TEAM, entityId: '1', label: 'First' },
      { customIdPrefix: TEAM, entityId: '1', label: 'Duplicate' },
      { customIdPrefix: ERA, entityId: '1', label: 'Different prefix' },
    ]);
    const [row] = components as EntityButtonRow[];
    expect(row.components.map((button) => button.label)).toEqual([
      'First',
      'Different prefix',
    ]);
  });

  it('still renders buttons at exactly 25 entries', () => {
    const { components, overflowNote } = service.buildEntityComponents(
      entries(25),
    );
    expect(overflowNote).toBeNull();
    expect(components).toHaveLength(5);
    for (const row of components as EntityButtonRow[]) {
      expect(row.components[0].type).toBe(ComponentType.Button);
      expect(row.components).toHaveLength(5);
    }
  });

  it('switches to select menus at 26 entries', () => {
    const { components, overflowNote } = service.buildEntityComponents(
      entries(26),
    );
    expect(overflowNote).toBeNull();
    expect(components).toHaveLength(2);
    const [first, second] = components as EntitySelectRow[];
    expect(first).toEqual({
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.StringSelect,
          custom_id: 'deepdive:team:menu:0',
          placeholder: 'Choose one (part 1 of 2)',
          options: entries(25).map((entry) => ({
            label: entry.label,
            value: entry.entityId,
          })),
        },
      ],
    });
    expect(second.components[0].custom_id).toBe('deepdive:team:menu:1');
    expect(second.components[0].placeholder).toBe('Choose one (part 2 of 2)');
    expect(second.components[0].options).toEqual([
      { label: 'Entity 26', value: '26' },
    ]);
  });

  it('fills five select menus at exactly 125 entries with no note', () => {
    const { components, overflowNote } = service.buildEntityComponents(
      entries(125),
    );
    expect(overflowNote).toBeNull();
    expect(components).toHaveLength(5);
    const rows = components as EntitySelectRow[];
    expect(rows.map((row) => row.components[0].custom_id)).toEqual([
      'deepdive:team:menu:0',
      'deepdive:team:menu:1',
      'deepdive:team:menu:2',
      'deepdive:team:menu:3',
      'deepdive:team:menu:4',
    ]);
    expect(rows.at(-1)?.components[0].options.at(-1)).toEqual({
      label: 'Entity 125',
      value: '125',
    });
  });

  it('truncates past 125 entries and reports the remainder in a note', () => {
    const { components, overflowNote } = service.buildEntityComponents(
      entries(126),
    );
    expect(components).toHaveLength(5);
    expect(overflowNote).toBe('…and 1 more without a link.');
  });

  it('gives each customId prefix its own select menu, in first-appearance order', () => {
    const { components, overflowNote } = service.buildEntityComponents([
      { customIdPrefix: ERA, entityId: '9', label: 'tLoEG First' },
      ...entries(30),
    ]);
    expect(overflowNote).toBeNull();
    const rows = components as EntitySelectRow[];
    expect(rows).toHaveLength(3);
    expect(rows[0].components[0].custom_id).toBe('deepdive:era:menu:0');
    expect(rows[0].components[0].placeholder).toBe('Choose one');
    expect(rows[0].components[0].options).toEqual([
      { label: 'tLoEG First', value: '9' },
    ]);
    expect(rows[1].components[0].custom_id).toBe('deepdive:team:menu:1');
    expect(rows[2].components[0].custom_id).toBe('deepdive:team:menu:2');
    expect(rows[2].components[0].options).toHaveLength(5);
  });

  it('counts entries dropped when prefix groups exhaust the five action rows', () => {
    const { components, overflowNote } = service.buildEntityComponents([
      { customIdPrefix: ERA, entityId: '9', label: 'tLoEG First' },
      ...entries(120),
    ]);
    // One row goes to the era menu, leaving four rows (100 options) for teams.
    expect(components).toHaveLength(5);
    expect(overflowNote).toBe('…and 20 more without a link.');
  });

  it('falls back to a non-breaking space for an empty button label', () => {
    const { components } = service.buildEntityComponents([
      { customIdPrefix: TEAM, entityId: '1', label: '' },
    ]);
    const [row] = components as EntityButtonRow[];
    expect(row.components[0]).toEqual({
      type: ComponentType.Button,
      style: ButtonStyle.Primary,
      label: BLANK_LABEL,
      custom_id: 'deepdive:team:1',
    });
  });

  it('treats a whitespace-only button label as blank', () => {
    const { components } = service.buildEntityComponents([
      { customIdPrefix: TEAM, entityId: '1', label: '   ' },
    ]);
    const [row] = components as EntityButtonRow[];
    expect(row.components[0].label).toBe(BLANK_LABEL);
  });

  it('trims incidental whitespace around a real button label', () => {
    const { components } = service.buildEntityComponents([
      { customIdPrefix: TEAM, entityId: '1', label: '  Bob  ' },
    ]);
    const [row] = components as EntityButtonRow[];
    expect(row.components[0].label).toBe('Bob');
  });

  it('leaves an ordinary button label untouched', () => {
    const { components } = service.buildEntityComponents([
      { customIdPrefix: TEAM, entityId: '1', label: 'Entity 1' },
    ]);
    const [row] = components as EntityButtonRow[];
    expect(row.components[0].label).toBe('Entity 1');
  });

  it('falls back to a non-breaking space for a blank select-menu option too', () => {
    // 26 entries forces the select-menu path; the blank one lands in menu 1.
    const { components, overflowNote } = service.buildEntityComponents([
      ...entries(25),
      { customIdPrefix: TEAM, entityId: '26', label: '' },
    ]);
    expect(overflowNote).toBeNull();
    const rows = components as EntitySelectRow[];
    expect(rows[1].components[0].options).toEqual([
      { label: BLANK_LABEL, value: '26' },
    ]);
  });
});
