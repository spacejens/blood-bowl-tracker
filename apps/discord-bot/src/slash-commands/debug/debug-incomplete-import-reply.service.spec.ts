import type { IncompleteImportTeamRow } from '@blood-bowl-tracker/game-data';
import { IncompleteImportPlayersService } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import type { InteractionReplyOptions } from 'discord.js';
import { ButtonStyle, ComponentType, MessageFlags } from 'discord.js';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { DEBUG_INCOMPLETE_IMPORT_NO_RESULTS_MESSAGE } from '../../error-messages';
import { DebugIncompleteImportReplyService } from './debug-incomplete-import-reply.service';
import { IncompleteImportReportService } from './incomplete-import-report.service';

const rows = [
  { teamEraId: 1, coachName: 'Skarsnik' },
] as unknown as IncompleteImportTeamRow[];

interface RenderedReply {
  embeds: {
    title: string;
    description: string;
    footer: { text: string };
  }[];
  components: {
    type: ComponentType;
    components: {
      type: ComponentType;
      style: ButtonStyle;
      label: string;
      custom_id: string;
      disabled: boolean;
    }[];
  }[];
}

function rendered(reply: InteractionReplyOptions): RenderedReply {
  return reply as unknown as RenderedReply;
}

describe('DebugIncompleteImportReplyService', () => {
  let service: DebugIncompleteImportReplyService;
  let players: MockProxy<IncompleteImportPlayersService>;
  let report: MockProxy<IncompleteImportReportService>;

  beforeEach(async () => {
    players = mock<IncompleteImportPlayersService>();
    players.findTeamsWithIncompletePlayers.mockResolvedValue(rows);
    report = mock<IncompleteImportReportService>();
    report.buildPages.mockReturnValue(['page one', 'page two', 'page three']);

    const moduleRef = await Test.createTestingModule({
      providers: [
        DebugIncompleteImportReplyService,
        { provide: IncompleteImportPlayersService, useValue: players },
        { provide: IncompleteImportReportService, useValue: report },
      ],
    }).compile();
    service = moduleRef.get(DebugIncompleteImportReplyService);
  });

  it('builds the pages from the freshly queried rows', async () => {
    await service.buildReply(1);

    expect(players.findTeamsWithIncompletePlayers).toHaveBeenCalledTimes(1);
    expect(report.buildPages).toHaveBeenCalledWith(rows);
  });

  it('replies with the plain no-results message when there are no pages', async () => {
    report.buildPages.mockReturnValue([]);

    await expect(service.buildReply(1)).resolves.toEqual({
      content: DEBUG_INCOMPLETE_IMPORT_NO_RESULTS_MESSAGE,
      flags: MessageFlags.Ephemeral,
    });
  });

  it('renders the requested page with its footer, ephemerally', async () => {
    const reply = await service.buildReply(2);

    expect(rendered(reply).embeds).toEqual([
      {
        title: 'Incomplete import data',
        description: 'page two',
        footer: { text: 'Page 2/3' },
      },
    ]);
    expect(reply.flags).toBe(MessageFlags.Ephemeral);
  });

  it('links Previous and Next to the neighbouring pages', async () => {
    const reply = await service.buildReply(2);

    expect(rendered(reply).components).toEqual([
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.Button,
            style: ButtonStyle.Secondary,
            label: 'Previous',
            custom_id: 'debug:incomplete:1',
            disabled: false,
          },
          {
            type: ComponentType.Button,
            style: ButtonStyle.Secondary,
            label: 'Next',
            custom_id: 'debug:incomplete:3',
            disabled: false,
          },
        ],
      },
    ]);
  });

  it('disables Previous on the first page', async () => {
    const [previous, next] = rendered(await service.buildReply(1)).components[0]
      .components;

    expect(previous.disabled).toBe(true);
    expect(next.disabled).toBe(false);
  });

  it('disables Next on the last page', async () => {
    const [previous, next] = rendered(await service.buildReply(3)).components[0]
      .components;

    expect(previous.disabled).toBe(false);
    expect(next.disabled).toBe(true);
  });

  it('disables both buttons when there is a single page', async () => {
    report.buildPages.mockReturnValue(['only page']);

    const [previous, next] = rendered(await service.buildReply(1)).components[0]
      .components;

    expect(previous.disabled).toBe(true);
    expect(next.disabled).toBe(true);
    expect(previous.custom_id).not.toBe(next.custom_id);
  });

  it('shows the last page for a page beyond the end', async () => {
    const reply = rendered(await service.buildReply(9));

    expect(reply.embeds[0].description).toBe('page three');
    expect(reply.embeds[0].footer.text).toBe('Page 3/3');
  });

  it('shows the first page for a page below 1', async () => {
    const reply = rendered(await service.buildReply(0));

    expect(reply.embeds[0].description).toBe('page one');
    expect(reply.embeds[0].footer.text).toBe('Page 1/3');
  });
});
