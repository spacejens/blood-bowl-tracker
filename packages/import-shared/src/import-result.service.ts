import type {
  ImportError,
  ImportResult,
} from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

/**
 * Builds ImportError and ImportResult values, typed with packages/api-contract's
 * result types so a result an importer receives over RPC merges straight into
 * its own run's results. Constructor-free and pure, so specs may pass it as a
 * real provider.
 */
@Injectable()
export class ImportResultService {
  error(args: { item: unknown; message: string }): ImportError {
    return { item: args.item, message: args.message };
  }

  /** `success` is true exactly when `errors` is empty. */
  result(args: { imported: number; errors: ImportError[] }): ImportResult {
    return {
      success: args.errors.length === 0,
      imported: args.imported,
      errors: args.errors,
    };
  }
}
