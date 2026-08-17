import { Test } from '@nestjs/testing';
import { ButtonStyle, ComponentType } from 'discord.js';
import { beforeEach, describe, expect, it } from 'vitest';

import type { ButtonCustomIdPrefix } from './deepdive/button-custom-ids';
import {
  COACH_BUTTON_CUSTOM_ID_PREFIX,
  COMPETITION_BUTTON_CUSTOM_ID_PREFIX,
  COMPETITION_GROUP_BUTTON_CUSTOM_ID_PREFIX,
  ERA_BUTTON_CUSTOM_ID_PREFIX,
  PLAYER_BUTTON_CUSTOM_ID_PREFIX,
  RACE_BUTTON_CUSTOM_ID_PREFIX,
  TEAM_BUTTON_CUSTOM_ID_PREFIX,
  TROPHY_BUTTON_CUSTOM_ID_PREFIX,
} from './deepdive/button-custom-ids';
import type {
  EntityButtonRow,
  EntityComponentEntry,
  EntitySelectRow,
} from './entity-components.service';
import { EntityComponentsService } from './entity-components.service';

function entries(
  count: number,
  customIdPrefix: ButtonCustomIdPrefix = TEAM_BUTTON_CUSTOM_ID_PREFIX,
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

/** Mirrors the service's own infix that turns a routing prefix into a menu custom id. */
const SELECT_MENU_CUSTOM_ID_INFIX = 'menu:';

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
      style: ButtonStyle.Success,
      label: 'Entity 1',
      custom_id: 'deepdive:team:1',
      emoji: { name: '🛡️' },
    });
  });

  it('gives each destination type its own button colour', () => {
    // One entry per destination type, in the design's mapping-table order.
    const cases: [ButtonCustomIdPrefix, ButtonStyle][] = [
      [ERA_BUTTON_CUSTOM_ID_PREFIX, ButtonStyle.Secondary],
      [COMPETITION_BUTTON_CUSTOM_ID_PREFIX, ButtonStyle.Secondary],
      [COMPETITION_GROUP_BUTTON_CUSTOM_ID_PREFIX, ButtonStyle.Secondary],
      [TROPHY_BUTTON_CUSTOM_ID_PREFIX, ButtonStyle.Secondary],
      [COACH_BUTTON_CUSTOM_ID_PREFIX, ButtonStyle.Success],
      [TEAM_BUTTON_CUSTOM_ID_PREFIX, ButtonStyle.Success],
      [PLAYER_BUTTON_CUSTOM_ID_PREFIX, ButtonStyle.Primary],
      [RACE_BUTTON_CUSTOM_ID_PREFIX, ButtonStyle.Success],
    ];
    const { components } = service.buildEntityComponents(
      cases.map(([customIdPrefix], index) => ({
        customIdPrefix,
        entityId: String(index + 1),
        label: `Entity ${index + 1}`,
      })),
    );
    const buttons = (components as EntityButtonRow[]).flatMap(
      (row) => row.components,
    );
    expect(buttons.map((button) => [button.custom_id, button.style])).toEqual(
      cases.map(([customIdPrefix, style], index) => [
        `${customIdPrefix}${index + 1}`,
        style,
      ]),
    );
  });

  it('gives each destination type its own button emoji', () => {
    // One entry per destination type, in the design's mapping-table order.
    const cases: [ButtonCustomIdPrefix, string][] = [
      [ERA_BUTTON_CUSTOM_ID_PREFIX, '🕰️'],
      [COACH_BUTTON_CUSTOM_ID_PREFIX, '📋'],
      [TEAM_BUTTON_CUSTOM_ID_PREFIX, '🛡️'],
      [PLAYER_BUTTON_CUSTOM_ID_PREFIX, '🎽'],
      [RACE_BUTTON_CUSTOM_ID_PREFIX, '🧬'],
      [COMPETITION_BUTTON_CUSTOM_ID_PREFIX, '🏟️'],
      [COMPETITION_GROUP_BUTTON_CUSTOM_ID_PREFIX, '🔁'],
      [TROPHY_BUTTON_CUSTOM_ID_PREFIX, '🏆'],
    ];
    const { components } = service.buildEntityComponents(
      cases.map(([customIdPrefix], index) => ({
        customIdPrefix,
        entityId: String(index + 1),
        label: `Entity ${index + 1}`,
      })),
    );
    const buttons = (components as EntityButtonRow[]).flatMap(
      (row) => row.components,
    );
    expect(
      buttons.map((button) => [button.custom_id, button.emoji.name]),
    ).toEqual(
      cases.map(([customIdPrefix, emojiName], index) => [
        `${customIdPrefix}${index + 1}`,
        emojiName,
      ]),
    );
  });

  it('returns each destination type its own emoji for a prefix', () => {
    // One case per destination type, in the design's mapping-table order.
    const cases: [ButtonCustomIdPrefix, string][] = [
      [ERA_BUTTON_CUSTOM_ID_PREFIX, '🕰️'],
      [COACH_BUTTON_CUSTOM_ID_PREFIX, '📋'],
      [TEAM_BUTTON_CUSTOM_ID_PREFIX, '🛡️'],
      [PLAYER_BUTTON_CUSTOM_ID_PREFIX, '🎽'],
      [RACE_BUTTON_CUSTOM_ID_PREFIX, '🧬'],
      [COMPETITION_BUTTON_CUSTOM_ID_PREFIX, '🏟️'],
      [COMPETITION_GROUP_BUTTON_CUSTOM_ID_PREFIX, '🔁'],
      [TROPHY_BUTTON_CUSTOM_ID_PREFIX, '🏆'],
    ];
    expect(
      cases.map(([customIdPrefix]) => [
        customIdPrefix,
        service.getEmojiForPrefix(customIdPrefix),
      ]),
    ).toEqual(cases);
  });

  it('drops duplicate entries, keeping the first occurrence', () => {
    const { components } = service.buildEntityComponents([
      {
        customIdPrefix: TEAM_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '1',
        label: 'First',
      },
      {
        customIdPrefix: TEAM_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '1',
        label: 'Duplicate',
      },
      {
        customIdPrefix: ERA_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '1',
        label: 'Different prefix',
      },
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
            emoji: { name: '🛡️' },
          })),
        },
      ],
    });
    expect(second.components[0].custom_id).toBe('deepdive:team:menu:1');
    expect(second.components[0].placeholder).toBe('Choose one (part 2 of 2)');
    expect(second.components[0].options).toEqual([
      { label: 'Entity 26', value: '26', emoji: { name: '🛡️' } },
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
      emoji: { name: '🛡️' },
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
      {
        customIdPrefix: ERA_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '9',
        label: 'tLoEG First',
      },
      ...entries(30),
    ]);
    expect(overflowNote).toBeNull();
    const rows = components as EntitySelectRow[];
    expect(rows).toHaveLength(3);
    expect(rows[0].components[0].custom_id).toBe('deepdive:era:menu:0');
    expect(rows[0].components[0].placeholder).toBe('Choose one');
    expect(rows[0].components[0].options).toEqual([
      { label: 'tLoEG First', value: '9', emoji: { name: '🕰️' } },
    ]);
    expect(rows[1].components[0].custom_id).toBe('deepdive:team:menu:1');
    expect(rows[2].components[0].custom_id).toBe('deepdive:team:menu:2');
    expect(rows[2].components[0].options).toHaveLength(5);
  });

  it('counts entries dropped when prefix groups exhaust the five action rows', () => {
    const { components, overflowNote } = service.buildEntityComponents([
      {
        customIdPrefix: ERA_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '9',
        label: 'tLoEG First',
      },
      ...entries(120),
    ]);
    // One row goes to the era menu, leaving four rows (100 options) for teams.
    expect(components).toHaveLength(5);
    expect(overflowNote).toBe('…and 20 more without a link.');
  });

  it('falls back to a non-breaking space for an empty button label', () => {
    const { components } = service.buildEntityComponents([
      {
        customIdPrefix: TEAM_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '1',
        label: '',
      },
    ]);
    const [row] = components as EntityButtonRow[];
    expect(row.components[0]).toEqual({
      type: ComponentType.Button,
      style: ButtonStyle.Success,
      label: BLANK_LABEL,
      custom_id: 'deepdive:team:1',
      emoji: { name: '🛡️' },
    });
  });

  it('treats a whitespace-only button label as blank', () => {
    const { components } = service.buildEntityComponents([
      {
        customIdPrefix: TEAM_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '1',
        label: '   ',
      },
    ]);
    const [row] = components as EntityButtonRow[];
    expect(row.components[0].label).toBe(BLANK_LABEL);
  });

  it('trims incidental whitespace around a real button label', () => {
    const { components } = service.buildEntityComponents([
      {
        customIdPrefix: TEAM_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '1',
        label: '  Bob  ',
      },
    ]);
    const [row] = components as EntityButtonRow[];
    expect(row.components[0].label).toBe('Bob');
  });

  it('leaves an ordinary button label untouched', () => {
    const { components } = service.buildEntityComponents([
      {
        customIdPrefix: TEAM_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '1',
        label: 'Entity 1',
      },
    ]);
    const [row] = components as EntityButtonRow[];
    expect(row.components[0].label).toBe('Entity 1');
  });

  it('falls back to a non-breaking space for a blank select-menu option too', () => {
    // 26 entries forces the select-menu path; the blank one lands in menu 1.
    const { components, overflowNote } = service.buildEntityComponents([
      ...entries(25),
      {
        customIdPrefix: TEAM_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '26',
        label: '',
      },
    ]);
    expect(overflowNote).toBeNull();
    const rows = components as EntitySelectRow[];
    expect(rows[1].components[0].options).toEqual([
      { label: BLANK_LABEL, value: '26', emoji: { name: '🛡️' } },
    ]);
  });

  it('gives each destination type its own select-menu option emoji', () => {
    // 26+ entries forces the select-menu path, and each destination type then
    // gets its own menu. Discord caps a message at five action rows, so the
    // eight types are checked in two batches rather than one.
    const batches: [ButtonCustomIdPrefix, string][][] = [
      [
        [ERA_BUTTON_CUSTOM_ID_PREFIX, '🕰️'],
        [COACH_BUTTON_CUSTOM_ID_PREFIX, '📋'],
        [TEAM_BUTTON_CUSTOM_ID_PREFIX, '🛡️'],
        [COMPETITION_GROUP_BUTTON_CUSTOM_ID_PREFIX, '🔁'],
      ],
      [
        [PLAYER_BUTTON_CUSTOM_ID_PREFIX, '🎽'],
        [RACE_BUTTON_CUSTOM_ID_PREFIX, '🧬'],
        [COMPETITION_BUTTON_CUSTOM_ID_PREFIX, '🏟️'],
        [TROPHY_BUTTON_CUSTOM_ID_PREFIX, '🏆'],
      ],
    ];
    for (const cases of batches) {
      const lastPrefix = cases[cases.length - 1][0];
      const { components, overflowNote } = service.buildEntityComponents([
        ...cases.map(([customIdPrefix], index) => ({
          customIdPrefix,
          entityId: String(index + 1),
          label: `Entity ${index + 1}`,
        })),
        // Pad past the 25-entry button cap without adding another menu group.
        ...entries(24, lastPrefix, 100),
      ]);
      expect(overflowNote).toBeNull();
      const rows = components as EntitySelectRow[];
      expect(
        rows.map((row) => [
          row.components[0].custom_id,
          // Every option in a menu, not just the first, so a mapping bug
          // that only affects later options in a group can't slip through.
          row.components[0].options.map((option) => option.emoji.name),
        ]),
      ).toEqual(
        cases.map(([customIdPrefix, emojiName], index) => [
          `${customIdPrefix}${SELECT_MENU_CUSTOM_ID_INFIX}${index}`,
          Array(rows[index].components[0].options.length).fill(emojiName),
        ]),
      );
    }
  });
});
