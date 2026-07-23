import {
  type ImportError,
  ImportResultService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

/**
 * The ImportError every page-scanning import records when a page throws while
 * being parsed. `pageDescription` names the kind of page ("position", "team",
 * "match list") and is the only part that varies.
 */
@Injectable()
export class PageParseErrorService {
  constructor(private readonly importResults: ImportResultService) {}

  build(
    pageParams: unknown,
    pageDescription: string,
    error: unknown,
  ): ImportError {
    return this.importResults.error({
      item: { page: pageParams },
      message: `Failed to parse ${pageDescription} page ${JSON.stringify(pageParams)}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    });
  }
}
