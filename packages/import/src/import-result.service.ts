import { Injectable } from '@nestjs/common';

import type { ImportError, ImportResult } from './types';

@Injectable()
export class ImportResultService {
  error(args: { item: unknown; message: string }): ImportError {
    return { item: args.item, message: args.message };
  }

  result(args: { imported: number; errors: ImportError[] }): ImportResult {
    return {
      success: args.errors.length === 0,
      imported: args.imported,
      errors: args.errors,
    };
  }
}
