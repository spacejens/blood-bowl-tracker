#!/usr/bin/env node

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import type { TpSourceFile } from './source/tp-source-reader';
import { TpSourceReader } from './source/tp-source-reader';
import { summarizeFiles } from './summarize-files';

async function run(): Promise<string[]> {
  const app = await NestFactory.createApplicationContext(AppModule.register(), {
    logger: false,
  });
  try {
    const reader = app.get(TpSourceReader);
    const files: TpSourceFile[] = [];
    for await (const file of reader.files()) {
      files.push(file);
    }
    return summarizeFiles(files);
  } finally {
    await app.close();
  }
}

run()
  .then((lines) => {
    for (const line of lines) {
      console.log(line);
    }
  })
  .catch((error: unknown) => {
    console.error('Discovery failed:', error);
    process.exit(1);
  });
