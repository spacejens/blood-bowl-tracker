import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { GitRootsService } from '@blood-bowl-tracker/cli-shared';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { TpFeedHistoryStoreService } from './tp-feed-history-store.service';
import type { TpFeedMessage } from './tp-feed-message.schema';

const CHANNEL = '222';

function message(id: string): TpFeedMessage {
  return {
    id,
    timestamp: '2026-01-01T00:00:00.000+00:00',
    embeds: [],
    extra: 'kept',
  };
}

describe('TpFeedHistoryStoreService', () => {
  let service: TpFeedHistoryStoreService;
  let gitRoots: MockProxy<GitRootsService>;
  let worktreeRoot: string;
  let channelDir: string;

  beforeEach(async () => {
    worktreeRoot = mkdtempSync(join(tmpdir(), 'tp-feed-history-'));
    channelDir = join(
      worktreeRoot,
      'tools/production-ops-cli/data/tp-feed-222',
    );
    gitRoots = mock<GitRootsService>();
    gitRoots.resolve.mockResolvedValue({
      mainRoot: worktreeRoot,
      worktreeRoot,
      isWorktree: false,
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpFeedHistoryStoreService,
        { provide: GitRootsService, useValue: gitRoots },
      ],
    }).compile();
    service = moduleRef.get(TpFeedHistoryStoreService);
  });

  afterEach(() => {
    if (existsSync(join(channelDir, 'messages'))) {
      chmodSync(join(channelDir, 'messages'), 0o700);
    }
    rmSync(worktreeRoot, { recursive: true, force: true });
  });

  it('keeps each channel under the tool data directory of this checkout, resolving it once', async () => {
    await expect(service.directory(CHANNEL)).resolves.toBe(channelDir);
    await service.directory(CHANNEL);

    expect(gitRoots.resolve).toHaveBeenCalledTimes(1);
  });

  describe('state', () => {
    it('reads no state before the first run', async () => {
      await expect(service.readState(CHANNEL)).resolves.toBeNull();
    });

    it('reads back the state it wrote', async () => {
      const state = {
        guildId: '111',
        newestId: '900',
        oldestId: '100',
        reachedStart: false,
      };

      await service.writeState(CHANNEL, state);

      await expect(service.readState(CHANNEL)).resolves.toEqual(state);
    });

    it('refuses a state file of the wrong shape, naming it', async () => {
      mkdirSync(channelDir, { recursive: true });
      writeFileSync(join(channelDir, 'state.json'), '{"newestId": 5}');

      await expect(service.readState(CHANNEL)).rejects.toThrow(
        /state\.json is not a valid TP feed history state file/,
      );
    });

    it('propagates a read failure other than a missing file', async () => {
      mkdirSync(join(channelDir, 'state.json'), { recursive: true });

      await expect(service.readState(CHANNEL)).rejects.toThrow(/EISDIR/);
    });
  });

  describe('messages', () => {
    it('saves a new message verbatim and reports it as new', async () => {
      await expect(service.saveMessage(CHANNEL, message('5'))).resolves.toBe(
        true,
      );

      expect(
        JSON.parse(
          readFileSync(join(channelDir, 'messages/5.json'), 'utf8'),
        ) as unknown,
      ).toEqual(message('5'));
    });

    it('skips a message already saved, leaving the file untouched', async () => {
      mkdirSync(join(channelDir, 'messages'), { recursive: true });
      writeFileSync(join(channelDir, 'messages/5.json'), '{"id":"5","old":1}');

      await expect(service.saveMessage(CHANNEL, message('5'))).resolves.toBe(
        false,
      );
      expect(readFileSync(join(channelDir, 'messages/5.json'), 'utf8')).toBe(
        '{"id":"5","old":1}',
      );
    });

    it('propagates a write failure other than an existing file', async () => {
      mkdirSync(join(channelDir, 'messages'), { recursive: true });
      chmodSync(join(channelDir, 'messages'), 0o500);

      await expect(service.saveMessage(CHANNEL, message('5'))).rejects.toThrow(
        /EACCES/,
      );
    });

    it('reads no messages before the first save', async () => {
      await expect(service.readMessages(CHANNEL)).resolves.toEqual([]);
    });

    it('reads back every saved message, ignoring other files', async () => {
      await service.saveMessage(CHANNEL, message('5'));
      await service.saveMessage(CHANNEL, message('7'));
      writeFileSync(join(channelDir, 'messages/notes.txt'), 'ignore me');

      const messages = await service.readMessages(CHANNEL);

      expect(messages.map((m) => m.id).sort()).toEqual(['5', '7']);
      expect(messages[0]).toHaveProperty('extra', 'kept');
    });

    it('propagates a listing failure other than a missing directory', async () => {
      mkdirSync(channelDir, { recursive: true });
      writeFileSync(join(channelDir, 'messages'), 'not a directory');

      await expect(service.readMessages(CHANNEL)).rejects.toThrow(/ENOTDIR/);
    });
  });

  it('writes the reports and unparsed index files as indented JSON', async () => {
    const index = {
      reports: { Team: { '#1 A (B)': [] } },
      unparsed: [{ reason: 'r', messageId: '5', link: 'l' }],
    };

    await service.writeIndex(CHANNEL, index);

    expect(readFileSync(join(channelDir, 'reports.json'), 'utf8')).toBe(
      `${JSON.stringify(index.reports, null, 2)}\n`,
    );
    expect(readFileSync(join(channelDir, 'unparsed.json'), 'utf8')).toBe(
      `${JSON.stringify(index.unparsed, null, 2)}\n`,
    );
  });
});
