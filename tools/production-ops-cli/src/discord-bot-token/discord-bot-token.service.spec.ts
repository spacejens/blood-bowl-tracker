import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { ProductionEnvFileService } from '../production-env-file/production-env-file.service';
import { DiscordBotTokenService } from './discord-bot-token.service';

describe('DiscordBotTokenService', () => {
  let service: DiscordBotTokenService;
  let productionEnvFile: MockProxy<ProductionEnvFileService>;

  async function makeService(): Promise<DiscordBotTokenService> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        DiscordBotTokenService,
        { provide: ProductionEnvFileService, useValue: productionEnvFile },
      ],
    }).compile();
    return moduleRef.get(DiscordBotTokenService);
  }

  beforeEach(async () => {
    productionEnvFile = mock<ProductionEnvFileService>();
    service = await makeService();
  });

  it('returns the token read from the production env file', async () => {
    productionEnvFile.readValue.mockResolvedValue('abc.def.ghi');

    await expect(service.read()).resolves.toBe('abc.def.ghi');
    expect(productionEnvFile.readValue).toHaveBeenCalledWith(
      'DISCORD_BOT_TOKEN',
    );
  });

  it('throws when DISCORD_BOT_TOKEN is set but empty', async () => {
    productionEnvFile.readValue.mockResolvedValue('');

    await expect(service.read()).rejects.toThrow(/empty/i);
  });

  it('propagates the error from reading the production env file', async () => {
    productionEnvFile.readValue.mockRejectedValue(
      new Error('apps/discord-bot/.env.production not found.'),
    );

    await expect(service.read()).rejects.toThrow(
      /apps\/discord-bot\/\.env\.production/,
    );
  });
});
