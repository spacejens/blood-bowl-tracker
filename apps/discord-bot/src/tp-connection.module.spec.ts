import type { TpConnectionProvider } from '@blood-bowl-tracker/import-tp-live';
import { TP_CONNECTION_PROVIDER } from '@blood-bowl-tracker/import-tp-live';
import { ConfigModule } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { DiscordBotConfigModule } from './discord-bot-config.module';
import { TpConnectionModule } from './tp-connection.module';

const TP_SETTINGS = {
  TP_EXTERNAL_SYSTEM_NAME: 'TP',
  TP_FRONTEND_BASE_URL: 'https://tp.example/blood-bowl/',
  TP_BACKEND_API_URL: 'https://tp.example/api/',
};

/**
 * Compiles the real `TpConnectionModule` with the real config module (per
 * CLAUDE.md's module-composition exception), to verify that the TP settings
 * are read when the provider is built, so a missing or invalid one fails
 * startup rather than the first TP request.
 */
function compile(env: Record<string, string>): Promise<TestingModule> {
  return Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [() => env],
      }),
      DiscordBotConfigModule,
      TpConnectionModule,
    ],
  }).compile();
}

describe('TpConnectionModule', () => {
  it.each(['true', 'false'])(
    'provides the TP URLs when TP_SCRAPING_ENABLED is %s',
    async (enabled) => {
      const moduleRef = await compile({
        ...TP_SETTINGS,
        TP_SCRAPING_ENABLED: enabled,
      });

      const connection = moduleRef.get<TpConnectionProvider>(
        TP_CONNECTION_PROVIDER,
      );
      expect(connection.getFrontendUrl()).toBe(
        'https://tp.example/blood-bowl/',
      );
      expect(connection.getBackendApiUrl()).toBe('https://tp.example/api/');
    },
  );

  it('fails to build when TP_SCRAPING_ENABLED is missing', async () => {
    await expect(compile(TP_SETTINGS)).rejects.toThrow(
      'TP_SCRAPING_ENABLED is not configured',
    );
  });

  it('fails to build when TP_SCRAPING_ENABLED is not true or false', async () => {
    await expect(
      compile({ ...TP_SETTINGS, TP_SCRAPING_ENABLED: 'yes' }),
    ).rejects.toThrow('TP_SCRAPING_ENABLED must be "true" or "false"');
  });

  it('still requires the TP URLs when TP scraping is disabled', async () => {
    await expect(
      compile({
        TP_EXTERNAL_SYSTEM_NAME: 'TP',
        TP_FRONTEND_BASE_URL: 'https://tp.example/blood-bowl/',
        TP_SCRAPING_ENABLED: 'false',
      }),
    ).rejects.toThrow('TP_BACKEND_API_URL is not configured');
  });
});
