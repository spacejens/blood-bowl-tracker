import { Test } from '@nestjs/testing';
import type {
  ChatInputCommandInteraction,
  InteractionReplyOptions,
} from 'discord.js';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { SlashCommandRegistryService } from '../slash-command-registry.service';
import { DebugIncompleteImportCommandService } from './debug-incomplete-import-command.service';
import { DebugIncompleteImportReplyService } from './debug-incomplete-import-reply.service';

describe('DebugIncompleteImportCommandService', () => {
  let service: DebugIncompleteImportCommandService;
  let registry: MockProxy<SlashCommandRegistryService>;
  let reply: MockProxy<DebugIncompleteImportReplyService>;

  beforeEach(async () => {
    registry = mock<SlashCommandRegistryService>();
    reply = mock<DebugIncompleteImportReplyService>();

    const moduleRef = await Test.createTestingModule({
      providers: [
        DebugIncompleteImportCommandService,
        { provide: SlashCommandRegistryService, useValue: registry },
        { provide: DebugIncompleteImportReplyService, useValue: reply },
      ],
    }).compile();
    service = moduleRef.get(DebugIncompleteImportCommandService);
  });

  it('registers itself on module init', () => {
    service.onModuleInit();

    expect(registry.register).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'debugincompleteimport' }),
    );
  });

  it('carries the shared debug prefix in its name and description', () => {
    const command = service.buildCommand();

    expect(command.name).toBe('debugincompleteimport');
    expect(command.description).toBe(
      'Debug: List teams with incomplete import data',
    );
  });

  it('restricts the command to the debug role', () => {
    expect(service.buildCommand().restrictedRole).toBe('debug');
  });

  it('takes no options', () => {
    expect(service.buildCommand().options ?? []).toEqual([]);
  });

  it('replies with the first page', async () => {
    const page: InteractionReplyOptions = { content: 'page one' };
    reply.buildReply.mockResolvedValue(page);

    await expect(
      service.buildCommand().execute(mock<ChatInputCommandInteraction>()),
    ).resolves.toBe(page);
    expect(reply.buildReply).toHaveBeenCalledWith(1);
  });
});
