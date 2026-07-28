import { timingSafeEqual } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const BEARER_PREFIX = 'Bearer ';

/**
 * The network callers allowed to reach `/rpc`, each with the env var carrying
 * its bearer token. Adding a fourth network caller (a new `tools/import-*`)
 * means adding a fourth entry here plus the matching env var.
 */
const CALLERS: ReadonlyArray<{ callerName: string; envVar: string }> = [
  { callerName: 'import-bbl', envVar: 'API_TOKEN_IMPORT_BBL' },
  { callerName: 'import-tp', envVar: 'API_TOKEN_IMPORT_TP' },
  { callerName: 'import-manual', envVar: 'API_TOKEN_IMPORT_MANUAL' },
];

/** Outcome of validating an `Authorization` header against the known tokens. */
export type AuthenticationResult =
  { authenticated: true; callerName: string } | { authenticated: false };

/**
 * Validates the `Authorization: Bearer <token>` header on RPC requests against
 * the tokens configured for each known importer tool. Authentication only —
 * every authenticated caller has the same access.
 */
@Injectable()
export class ApiTokenAuthService {
  private readonly logger = new Logger(ApiTokenAuthService.name);

  private readonly configured: ReadonlyArray<{
    callerName: string;
    token: Buffer;
  }>;

  constructor(configService: ConfigService) {
    this.configured = CALLERS.flatMap(({ callerName, envVar }) => {
      const token = configService.get<string>(envVar);
      return token ? [{ callerName, token: Buffer.from(token, 'utf8') }] : [];
    });
    if (this.configured.length === 0) {
      this.logger.warn(
        `No API tokens configured (${CALLERS.map((c) => c.envVar).join(', ')}) — every RPC request will be rejected with 401.`,
      );
    }
  }

  /**
   * Returns the caller matching the presented bearer token, or an
   * unauthenticated result when the header is absent, malformed, or carries a
   * token matching no configured caller.
   */
  authenticate(authorizationHeader: string | undefined): AuthenticationResult {
    if (authorizationHeader?.startsWith(BEARER_PREFIX) !== true) {
      return { authenticated: false };
    }
    const presented = Buffer.from(
      authorizationHeader.slice(BEARER_PREFIX.length),
      'utf8',
    );
    for (const caller of this.configured) {
      // timingSafeEqual throws on mismatched lengths, so the length has to be
      // checked first. Token length is not itself a secret.
      if (
        presented.length === caller.token.length &&
        timingSafeEqual(presented, caller.token)
      ) {
        return { authenticated: true, callerName: caller.callerName };
      }
    }
    return { authenticated: false };
  }
}
