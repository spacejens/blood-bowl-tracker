#!/usr/bin/env node

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { LeaguesDownloaderService } from './downloader/leagues-downloader.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  const leagueDownloaderService = app.get(LeaguesDownloaderService);
  await leagueDownloaderService.downloadAllLeagues();
}

void bootstrap();
