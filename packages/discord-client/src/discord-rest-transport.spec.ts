import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import type { Http2SecureServer } from 'node:http2';
import { createSecureServer } from 'node:http2';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TLSSocket } from 'node:tls';

import { REST } from 'discord.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const GATEWAY_BODY = { url: 'wss://gateway.example.test' };

/**
 * Runs the real discord.js REST client, and so the real @discordjs/rest and
 * undici pairing, against a local HTTPS server that offers HTTP/2 the way
 * discord.com does. An undici whose HTTP/2 response headers @discordjs/rest
 * cannot turn into a Headers object makes this request throw.
 */
describe('discord.js REST transport', () => {
  const sockets = new Set<TLSSocket>();
  const requestedPaths: string[] = [];
  const previousTlsSetting = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  let certDir: string | undefined;
  let server: Http2SecureServer | undefined;
  let api: string;

  beforeAll(async () => {
    certDir = mkdtempSync(join(tmpdir(), 'discord-rest-transport-'));
    const keyPath = join(certDir, 'key.pem');
    const certPath = join(certDir, 'cert.pem');
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        keyPath,
        '-out',
        certPath,
        '-days',
        '1',
        '-subj',
        '/CN=127.0.0.1',
      ],
      { stdio: 'ignore' },
    );

    const secureServer = createSecureServer({
      key: readFileSync(keyPath),
      cert: readFileSync(certPath),
      allowHTTP1: true,
    });
    server = secureServer;
    secureServer.on('secureConnection', (socket: TLSSocket) => {
      sockets.add(socket);
    });
    secureServer.on('request', (req, res) => {
      requestedPaths.push(req.url);
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(GATEWAY_BODY));
    });
    await new Promise<void>((resolve) => {
      secureServer.listen(0, '127.0.0.1', resolve);
    });
    const { port } = secureServer.address() as AddressInfo;
    api = `https://127.0.0.1:${port}`;

    // @discordjs/rest offers no way to pass a trusted certificate, so the
    // self-signed one is accepted by disabling verification for this test.
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  });

  afterAll(async () => {
    if (previousTlsSetting === undefined) {
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    } else {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = previousTlsSetting;
    }
    for (const socket of sockets) socket.destroy();
    const startedServer = server;
    if (startedServer) {
      await new Promise<void>((resolve) => {
        startedServer.close(() => resolve());
      });
    }
    if (certDir) rmSync(certDir, { recursive: true, force: true });
  });

  it('fetches the gateway and returns its JSON body', async () => {
    const rest = new REST({ api, version: '10' });

    await expect(rest.get('/gateway', { auth: false })).resolves.toEqual(
      GATEWAY_BODY,
    );
    expect(requestedPaths).toEqual(['/v10/gateway']);
  });
});
