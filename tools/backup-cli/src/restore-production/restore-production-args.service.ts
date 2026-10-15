import { Injectable } from '@nestjs/common';

import {
  RESTORE_PRODUCTION_CONFIRMATION,
  RestoreProductionRequest,
} from './restore-production.service';

export const RESTORE_PRODUCTION_USAGE =
  'Usage: node dist/main.js restore-production [<backup-key>] [--dry-run] ' +
  '[--confirm <phrase>] (a dry run checks the newest backup when the key is ' +
  'omitted; a real restore needs an explicit <backup-key> and ' +
  `--confirm ${RESTORE_PRODUCTION_CONFIRMATION})`;

/** Parses `restore-production`'s arguments, which may come in any order. */
@Injectable()
export class RestoreProductionArgsService {
  parse(args: readonly string[]): RestoreProductionRequest {
    let key: string | undefined;
    let dryRun = false;
    let confirm: string | undefined;
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === '--dry-run') {
        dryRun = true;
      } else if (arg === '--confirm') {
        const value = args[i + 1];
        if (value === undefined || value === '' || confirm !== undefined) {
          throw new Error(RESTORE_PRODUCTION_USAGE);
        }
        confirm = value;
        i++;
      } else if (arg.startsWith('--') || (arg !== '' && key !== undefined)) {
        throw new Error(RESTORE_PRODUCTION_USAGE);
      } else if (arg !== '') {
        key = arg;
      }
    }
    if (dryRun && confirm !== undefined) {
      throw new Error(
        `--dry-run and --confirm cannot be combined. ${RESTORE_PRODUCTION_USAGE}`,
      );
    }
    if (confirm !== undefined && key === undefined) {
      throw new Error(
        'A real restore needs an explicit <backup-key>; it never defaults to ' +
          `the newest backup. ${RESTORE_PRODUCTION_USAGE}`,
      );
    }
    return {
      ...(key === undefined ? {} : { key }),
      dryRun,
      ...(confirm === undefined ? {} : { confirm }),
    };
  }
}
