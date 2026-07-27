import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class FileSystemService {
  constructor(private readonly configService: ConfigService) {}

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

  private outputDir(): string {
    return (
      'tp-site/' + this.configService.getOrThrow<string>('OUTPUT_DIR') + '/'
    );
  }
}
