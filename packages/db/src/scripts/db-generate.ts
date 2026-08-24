#!/usr/bin/env node

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NestFactory } from '@nestjs/core';

import { DbGenerateModule } from './db-generate.module.js';
import { DbGenerateService } from './db-generate.service.js';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(DbGenerateModule, {
    logger: false,
  });
  const service = app.get(DbGenerateService);
  service.generate(process.argv.slice(2), packageRoot);
  await app.close();
}

void bootstrap();
