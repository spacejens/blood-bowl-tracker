import { Test } from '@nestjs/testing';
import { ButtonStyle, ComponentType } from 'discord.js';
import { beforeEach, describe, expect, it } from 'vitest';

import { DEBUG_RETRIGGER_CUSTOM_ID_PREFIX } from './debug-custom-ids';
import { DebugRetriggerButtonsService } from './debug-retrigger-buttons.service';

describe('DebugRetriggerButtonsService', () => {
  let service: DebugRetriggerButtonsService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [DebugRetriggerButtonsService],
    }).compile();
    service = moduleRef.get(DebugRetriggerButtonsService);
  });

  it('builds one secondary button per event, labelled by row number', () => {
    expect(service.build([11, 12])).toEqual([
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.Button,
            style: ButtonStyle.Secondary,
            label: '1',
            custom_id: 'debug:retrigger:11',
          },
          {
            type: ComponentType.Button,
            style: ButtonStyle.Secondary,
            label: '2',
            custom_id: 'debug:retrigger:12',
          },
        ],
      },
    ]);
  });

  it('carries the shared retrigger prefix in every custom id', () => {
    const [row] = service.build([11]);

    expect(
      row.components[0].custom_id.startsWith(DEBUG_RETRIGGER_CUSTOM_ID_PREFIX),
    ).toBe(true);
  });

  it('chunks twenty events into four rows of five', () => {
    const rows = service.build(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );

    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.components.length === 5)).toBe(true);
    expect(rows[3].components[4].label).toBe('20');
  });

  it('leaves a partial final row partial', () => {
    const rows = service.build([1, 2, 3, 4, 5, 6]);

    expect(rows.map((row) => row.components.length)).toEqual([5, 1]);
  });

  it('builds nothing for no events', () => {
    expect(service.build([])).toEqual([]);
  });
});
