import { Injectable } from '@nestjs/common';

/**
 * Injectable wrapper around `process.exit`, so the fatal path (losing the
 * advisory lock while active) can be unit-tested without killing the test
 * process.
 */
@Injectable()
export class ProcessExitService {
  exit(code: number): void {
    process.exit(code);
  }
}
