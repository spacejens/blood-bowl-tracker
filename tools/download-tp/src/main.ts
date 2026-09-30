#!/usr/bin/env node

import { TpBlockedError } from '@blood-bowl-tracker/scrape-tp';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { DownloadRunnerService } from './downloader/download-runner.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  await app.get(DownloadRunnerService).run();
}

bootstrap().catch((error: unknown) => {
  // A block ends the run like any other error; a stack trace would only
  // bury the one thing worth knowing: when TP may be tried again. Only the
  // plain-HTTP download method raises it.
  if (error instanceof TpBlockedError) {
    console.error(
      `download-tp stopped: TP is blocking requests (HTTP 403 Access denied). Files already written are kept; TP may next be tried after ${error.retryAt.toISOString()}.`,
    );
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
