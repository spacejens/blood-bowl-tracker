export interface ImportError {
  item: unknown;
  message: string;
}

export interface ImportResult {
  success: boolean;
  imported: number;
  errors: ImportError[];
}
