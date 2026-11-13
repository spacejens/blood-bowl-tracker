import type {
  AdvancementOrderProblem,
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

  /**
   * One error per confirmed advancement order the SPP adjustments sync found
   * contradicting the player's stored SPP, so a bulk and a live import word
   * them alike.
   */
  orderProblemErrors(problems: AdvancementOrderProblem[]): ImportError[] {
    return problems.map(({ playerId, name, problem }) =>
      this.error({
        item: { playerId },
        message: `Rechecking the confirmed advancement order of ${name} (player ${playerId}) against his stored SPP failed: ${problem}`,
      }),
    );
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
