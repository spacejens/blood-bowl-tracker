import type { TpPageClassification } from '@blood-bowl-tracker/tp-paths';
import { TpPageClassifierService } from '@blood-bowl-tracker/tp-paths';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type {
  ChatInputCommandInteraction,
  InteractionReplyOptions,
} from 'discord.js';
import { ApplicationCommandOptionType, MessageFlags } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { DiscordBotConfigService } from '../../discord-bot-config.service';
import { IMPORT_TP_UNSUPPORTED_URL_MESSAGE } from '../../error-messages';
import type { TpImportOutcome } from '../../tp-import/tp-import-dispatch.service';
import { TpImportDispatchService } from '../../tp-import/tp-import-dispatch.service';
import { SlashCommandRegistryService } from '../slash-command-registry.service';
import { ImportTpCommandService } from './import-tp-command.service';
import { ImportTpReplyService } from './import-tp-reply.service';

const BASE = 'https://tourplay.net/en/blood-bowl/';
const ROSTER_URL = `${BASE}roster/163386`;
const ROSTER_PAGE: TpPageClassification = { kind: 'roster', rosterId: 163386 };
const OUTCOME = { kind: 'roster', rosterId: 163386 } as TpImportOutcome;
const REPLY: InteractionReplyOptions = { embeds: [], flags: 64 };
const FAILURE_REPLY: InteractionReplyOptions = {
  embeds: [{ title: 'TP import failed' }],
  flags: 64,
};

/** An `/importtp` invocation with the given option values. */
function interaction(options: {
  url?: string;
  era?: string;
}): ChatInputCommandInteraction {
  const values = new Map<string, string | undefined>([
    ['url', options.url],
    ['era', options.era],
  ]);
  const mocked = mockDeep<ChatInputCommandInteraction>();
  mocked.options.getString.mockImplementation(
    (name: string) => values.get(name) ?? null,
  );
  return mocked;
}

describe('ImportTpCommandService', () => {
  let service: ImportTpCommandService;
  let config: MockProxy<DiscordBotConfigService>;
  let classifier: MockProxy<TpPageClassifierService>;
  let dispatch: MockProxy<TpImportDispatchService>;
  let reply: MockProxy<ImportTpReplyService>;
  let registry: DeepMockProxy<SlashCommandRegistryService>;

  beforeEach(async () => {
    config = mock<DiscordBotConfigService>();
    config.getTpFrontendBaseUrl.mockReturnValue(BASE);
    config.getTpExternalSystemName.mockReturnValue('tourplay.net');
    classifier = mock<TpPageClassifierService>();
    classifier.classify.mockReturnValue(ROSTER_PAGE);
    dispatch = mock<TpImportDispatchService>();
    dispatch.dispatch.mockResolvedValue(OUTCOME);
    reply = mock<ImportTpReplyService>();
    reply.build.mockReturnValue(REPLY);
    registry = mockDeep<SlashCommandRegistryService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ImportTpCommandService,
        { provide: DiscordBotConfigService, useValue: config },
        { provide: TpPageClassifierService, useValue: classifier },
        { provide: TpImportDispatchService, useValue: dispatch },
        { provide: ImportTpReplyService, useValue: reply },
        { provide: SlashCommandRegistryService, useValue: registry },
      ],
    }).compile();
    service = moduleRef.get(ImportTpCommandService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers itself on module init', () => {
    service.onModuleInit();

    expect(registry.register).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'importtp' }),
    );
  });

  it('fails module init, registering nothing, when a required TP setting is missing', () => {
    config.getTpExternalSystemName.mockImplementation(() => {
      throw new Error('TP_EXTERNAL_SYSTEM_NAME is not configured');
    });

    expect(() => service.onModuleInit()).toThrow(
      'TP_EXTERNAL_SYSTEM_NAME is not configured',
    );
    expect(registry.register).not.toHaveBeenCalled();
  });

  it('is an admin-restricted, deferred command with a required url and an optional era', () => {
    const command = service.buildCommand();

    expect(command.name).toBe('importtp');
    expect(command.description).toBe(
      'Admin: Import a TP competition, match, team or official teams page',
    );
    expect(command.restrictedRole).toBe('admin');
    expect(command.deferEphemeral).toBe(true);
    expect(command.options).toEqual([
      expect.objectContaining({
        name: 'url',
        type: ApplicationCommandOptionType.String,
        required: true,
      }),
      expect.objectContaining({
        name: 'era',
        type: ApplicationCommandOptionType.String,
      }),
    ]);
    expect(command.options?.[1]).not.toHaveProperty('required', true);
  });

  it('classifies the URL against the configured frontend, imports it, and replies with the summary', async () => {
    await expect(
      service.execute(interaction({ url: ROSTER_URL })),
    ).resolves.toBe(REPLY);

    expect(classifier.classify).toHaveBeenCalledWith(ROSTER_URL, BASE);
    expect(dispatch.dispatch).toHaveBeenCalledWith({
      page: ROSTER_PAGE,
      era: undefined,
    });
    expect(reply.build).toHaveBeenCalledWith(OUTCOME);
  });

  it('passes a given era through, trimmed', async () => {
    await service.execute(
      interaction({ url: ROSTER_URL, era: ' Fourth era ' }),
    );

    expect(dispatch.dispatch).toHaveBeenCalledWith({
      page: ROSTER_PAGE,
      era: 'Fourth era',
    });
  });

  it('treats a blank era as not given', async () => {
    await service.execute(interaction({ url: ROSTER_URL, era: '   ' }));

    expect(dispatch.dispatch).toHaveBeenCalledWith({
      page: ROSTER_PAGE,
      era: undefined,
    });
  });

  it('replies with an ephemeral error, importing nothing, for a URL that is no importable TP page', async () => {
    classifier.classify.mockReturnValue({ kind: 'unknown' });

    await expect(
      service.execute(interaction({ url: 'https://example.com/' })),
    ).resolves.toEqual({
      content: IMPORT_TP_UNSUPPORTED_URL_MESSAGE,
      flags: MessageFlags.Ephemeral,
    });
    expect(dispatch.dispatch).not.toHaveBeenCalled();
  });

  it('replies with the unexpected-failure embed, and logs, when the import throws', async () => {
    const error = new Error('database down');
    const logged = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    dispatch.dispatch.mockRejectedValue(error);
    reply.buildUnexpectedFailure.mockReturnValue(FAILURE_REPLY);

    await expect(
      service.execute(interaction({ url: ROSTER_URL })),
    ).resolves.toBe(FAILURE_REPLY);
    expect(reply.buildUnexpectedFailure).toHaveBeenCalledWith(error);
    expect(reply.build).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledWith(
      `/importtp of ${ROSTER_URL} failed unexpectedly`,
      error.stack,
    );
  });

  it('passes a non-Error rejection to the reply and logs it as a string', async () => {
    const logged = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    dispatch.dispatch.mockRejectedValue('boom');
    reply.buildUnexpectedFailure.mockReturnValue(FAILURE_REPLY);

    await expect(
      service.execute(interaction({ url: ROSTER_URL })),
    ).resolves.toBe(FAILURE_REPLY);
    expect(reply.buildUnexpectedFailure).toHaveBeenCalledWith('boom');
    expect(reply.build).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledWith(
      `/importtp of ${ROSTER_URL} failed unexpectedly`,
      'boom',
    );
  });
});
