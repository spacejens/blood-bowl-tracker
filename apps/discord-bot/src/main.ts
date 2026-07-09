import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { DiscordBotConfigService } from './discord-bot-config.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const config = app.get(DiscordBotConfigService);
  await app.listen(config.getPort());
}
bootstrap().catch((err) => {
  console.error('Fatal error during bootstrap:', err);
  process.exit(1);
});
