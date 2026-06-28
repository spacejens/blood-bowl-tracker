#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { createApiClient } from '@blood-bowl-tracker/api-client';
import { parseBblExport } from './bbl-parser';
import { importBblData } from './bbl-importer';

const [, , filePath, baseUrl] = process.argv;

if (!filePath || !baseUrl) {
  console.error('Usage: import-bbl <bbl-export.json> <api-base-url>');
  process.exit(1);
}

const json = readFileSync(filePath, 'utf-8');
const data = parseBblExport(json);
const client = createApiClient(baseUrl);

importBblData(data, client).then((result) => {
  if (result.success) {
    console.log(`Imported ${result.imported} team(s) successfully.`);
  } else {
    console.error(`Import completed with ${result.errors.length} errors:`);
    result.errors.forEach((e) => console.error(`  - ${e.message}`));
    process.exit(1);
  }
});
