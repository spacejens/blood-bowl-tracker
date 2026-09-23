import type {
  ImportError,
  ImportResult,
} from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

/**
 * Builds this package's ImportError and ImportResult values — the same two
 * helpers packages/import's ImportResultService offers the import tools. A
 * separate copy because this package runs server-side and packages/import
 * reaches the api-server over RPC. Constructor-free and pure, so specs may
 * pass it as a real provider.
 */
@Injectable()
export class TpImportResultsService {
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
