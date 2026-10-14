import { Injectable } from '@nestjs/common';

/** `owner/repo[/path]@<40 lowercase hex>`: a remote action or reusable workflow. */
const PINNED_REMOTE = /^[^/@\s]+\/[^@\s]+@[0-9a-f]{40}$/;

/** `docker://image[:tag]@sha256:<64 lowercase hex>`. */
const PINNED_DOCKER = /^docker:\/\/[^@\s]+@sha256:[0-9a-f]{64}$/;

/**
 * Decides whether one workflow `uses:` value is immutable: a local path, a
 * remote reference by full commit SHA, or a Docker image by digest. Tags and
 * branches can be re-pointed upstream, so they never pass.
 */
@Injectable()
export class UsesRefClassifierService {
  isPinned(uses: string): boolean {
    if (uses.startsWith('./')) {
      return true;
    }
    if (uses.startsWith('docker://')) {
      return PINNED_DOCKER.test(uses);
    }
    return PINNED_REMOTE.test(uses);
  }
}
