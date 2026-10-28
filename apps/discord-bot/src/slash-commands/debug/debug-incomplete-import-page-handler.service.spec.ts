import {
  DEBUG_COMMAND_ROLE_ID,
  DiscordClientService,
  MemberRoleAccessService,
} from '@blood-bowl-tracker/discord-client';
import { Test } from '@nestjs/testing';
import type { ButtonInteraction, InteractionReplyOptions } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { DEBUG_RETRIGGER_ACCESS_DENIED_MESSAGE } from '../../error-messages';
import { DEBUG_INCOMPLETE_IMPORT_CUSTOM_ID_PREFIX } from './debug-custom-ids';
import { DebugIncompleteImportPageHandlerService } from './debug-incomplete-import-page-handler.service';
import { DebugIncompleteImportReplyService } from './debug-incomplete-import-reply.service';

const page: InteractionReplyOptions = { content: 'a page' };
const member = { roles: [] } as unknown as ButtonInteraction['member'];

function click(remainder: string): ButtonInteraction {
  return {
    customId: `${DEBUG_INCOMPLETE_IMPORT_CUSTOM_ID_PREFIX}${remainder}`,
    member,
  } as unknown as ButtonInteraction;
}

/**
 * A freshly compiled handler for a deployment whose debug role id is
 * `debugRoleId` (`undefined` meaning none configured) - an input that must
 * exist before construction, hence a factory rather than `beforeEach`.
 */
async function makeService(debugRoleId: string | undefined): Promise<{
  service: DebugIncompleteImportPageHandlerService;
  reply: MockProxy<DebugIncompleteImportReplyService>;
  discordClient: MockProxy<DiscordClientService>;
  memberRoleAccess: MockProxy<MemberRoleAccessService>;
}> {
  const reply = mock<DebugIncompleteImportReplyService>();
  reply.buildReply.mockResolvedValue(page);
  const discordClient = mock<DiscordClientService>();
  const memberRoleAccess = mock<MemberRoleAccessService>();

  const moduleRef = await Test.createTestingModule({
    providers: [
      DebugIncompleteImportPageHandlerService,
      { provide: DebugIncompleteImportReplyService, useValue: reply },
      { provide: DiscordClientService, useValue: discordClient },
      { provide: MemberRoleAccessService, useValue: memberRoleAccess },
      { provide: DEBUG_COMMAND_ROLE_ID, useValue: debugRoleId },
    ],
  }).compile();

  return {
    service: moduleRef.get(DebugIncompleteImportPageHandlerService),
    reply,
    discordClient,
    memberRoleAccess,
  };
}

describe('DebugIncompleteImportPageHandlerService', () => {
  it('registers a button handler on its prefix on module init', async () => {
    const { service, discordClient } = await makeService(undefined);

    service.onModuleInit();

    expect(discordClient.registerButtonHandler).toHaveBeenCalledWith(
      DEBUG_INCOMPLETE_IMPORT_CUSTOM_ID_PREFIX,
      expect.any(Function),
    );
  });

  it('routes the registered handler to handle', async () => {
    const { service, discordClient, reply } = await makeService(undefined);
    service.onModuleInit();
    const handler = discordClient.registerButtonHandler.mock.calls[0][1];

    await expect(handler(click('2'))).resolves.toBe(page);
    expect(reply.buildReply).toHaveBeenCalledWith(2);
  });

  it('shows the page in the custom id when no debug role is configured', async () => {
    const { service, reply, memberRoleAccess } = await makeService(undefined);

    await expect(service.handle(click('3'))).resolves.toBe(page);
    expect(reply.buildReply).toHaveBeenCalledWith(3);
    expect(memberRoleAccess.hasRole).not.toHaveBeenCalled();
  });

  it('shows the page to a member holding the debug role', async () => {
    const { service, reply, memberRoleAccess } = await makeService('role-1');
    memberRoleAccess.hasRole.mockReturnValue(true);

    await expect(service.handle(click('2'))).resolves.toBe(page);
    expect(memberRoleAccess.hasRole).toHaveBeenCalledWith(member, 'role-1');
    expect(reply.buildReply).toHaveBeenCalledWith(2);
  });

  it('refuses a member without the debug role', async () => {
    const { service, reply, memberRoleAccess } = await makeService('role-1');
    memberRoleAccess.hasRole.mockReturnValue(false);

    await expect(service.handle(click('2'))).resolves.toEqual({
      content: DEBUG_RETRIGGER_ACCESS_DENIED_MESSAGE,
      flags: MessageFlags.Ephemeral,
    });
    expect(reply.buildReply).not.toHaveBeenCalled();
  });

  it('falls back to the first page for a malformed page number', async () => {
    const { service, reply } = await makeService(undefined);

    await service.handle(click('abc'));

    expect(reply.buildReply).toHaveBeenCalledWith(1);
  });

  it.each(['', '0', '-2', '1.5', '2x', 'NaN', ' ', 'Infinity', '1e2'])(
    'falls back to the first page for the malformed page %j',
    async (remainder) => {
      const { service, reply } = await makeService(undefined);

      await service.handle(click(remainder));

      expect(reply.buildReply).toHaveBeenCalledWith(1);
    },
  );

  it('refuses a missing member (a DM) when a debug role is configured', async () => {
    const { service, reply, memberRoleAccess } = await makeService('role-1');
    memberRoleAccess.hasRole.mockReturnValue(false);
    const dmClick = {
      customId: `${DEBUG_INCOMPLETE_IMPORT_CUSTOM_ID_PREFIX}2`,
      member: null,
    } as unknown as ButtonInteraction;

    await expect(service.handle(dmClick)).resolves.toEqual({
      content: DEBUG_RETRIGGER_ACCESS_DENIED_MESSAGE,
      flags: MessageFlags.Ephemeral,
    });
    expect(memberRoleAccess.hasRole).toHaveBeenCalledWith(null, 'role-1');
    expect(reply.buildReply).not.toHaveBeenCalled();
  });
});
