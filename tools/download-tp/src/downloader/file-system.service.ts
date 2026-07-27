import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

import { Injectable } from '@nestjs/common';

@Injectable()
export class FileSystemService {
  mkdir(dirName: string): void {
    const fullDirName = this.outputDir() + dirName;
    console.log(`Creating directory ${fullDirName}`);
    if (!existsSync(fullDirName)) {
      mkdirSync(fullDirName, { recursive: true });
    }
  }

  writeJsonFile(dirName: string, fileName: string, contents: unknown): void {
    const fullDirName = this.outputDir() + dirName;
    const fullFileName =
      fullDirName + '/' + fileName.replaceAll('/', '_') + '.json';
    console.log(`Writing file ${fullFileName}`);
    writeFileSync(fullFileName, JSON.stringify(contents, null, 2));
  }

  /**
   * Fixed output root. One folder per competition already identifies the
   * tournament, so no configurable subdirectory is needed; this mirrors
   * `tools/import-tp/data/<era>/<competition>/` one level down.
   */
  private outputDir(): string {
    return 'data/';
  }
}
