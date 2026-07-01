export interface ImportError {
  item: unknown;
  message: string;
}

export interface ImportResult {
  success: boolean;
  imported: number;
  errors: ImportError[];
}

export function makeImportError(args: {
  item: unknown;
  message: string;
}): ImportError {
  return { item: args.item, message: args.message };
}

export function makeImportResult(args: {
  imported: number;
  errors: ImportError[];
}): ImportResult {
  return {
    success: args.errors.length === 0,
    imported: args.imported,
    errors: args.errors,
  };
}
