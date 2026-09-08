import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * `packages/db` is documented (docs/architecture.md) as the only workspace
 * that imports directly from the database driver, so a breaking change in the
 * pre-release Drizzle dependency lands in exactly one place. That claim had
 * silently stopped being true; this test is what keeps it true.
 *
 * Deliberately reaches outside this workspace: a monorepo-wide invariant has
 * no other home that runs on every `pnpm test` without new CI wiring.
 */
const repoRoot = join(__dirname, '../../..');

/** The driver packages nobody but `packages/db` may declare. */
const DRIVER_PACKAGES = ['drizzle-orm', 'postgres'];

/** The one workspace allowed to declare them. */
const OWNER = 'packages/db';

/**
 * The `packages:` globs from `pnpm-workspace.yaml`, read rather than hardcoded
 * so a newly added workspace directory is covered automatically. Parsed with a
 * line scanner instead of a YAML library to avoid adding a dependency for one
 * flat list of strings.
 */
function workspaceGlobs(): string[] {
  const yaml = readFileSync(join(repoRoot, 'pnpm-workspace.yaml'), 'utf8');
  const globs: string[] = [];
  let inPackages = false;
  for (const line of yaml.split('\n')) {
    if (/^packages:\s*$/.test(line)) {
      inPackages = true;
      continue;
    }
    if (!inPackages) continue;
    if (/^\s*#/.test(line)) continue;
    const entry = /^\s+-\s*["']?([^"'\s]+)["']?\s*$/.exec(line);
    if (entry) {
      globs.push(entry[1]);
      continue;
    }
    // The first non-list, non-blank, non-comment line is the next top-level
    // key.
    if (line.trim() !== '') break;
  }
  return globs;
}

/**
 * Every workspace directory, relative to the repo root, plus `''` for the
 * repo root's own `package.json`. pnpm installs the root manifest's
 * dependencies into the shared root `node_modules`, which every workspace's
 * Node resolution walks up into — so a driver package declared there would be
 * importable from anywhere and would otherwise slip past this guard entirely.
 */
function workspaceDirs(): string[] {
  return [
    '',
    ...workspaceGlobs().flatMap((glob) => {
      const [dir, star] = glob.split('/');
      if (star !== '*') {
        throw new Error(
          `Unsupported workspace glob in pnpm-workspace.yaml: ${glob}`,
        );
      }
      return readdirSync(join(repoRoot, dir))
        .filter((name) => existsSync(join(repoRoot, dir, name, 'package.json')))
        .map((name) => `${dir}/${name}`);
    }),
  ];
}

/**
 * Reads all four dependency fields, not just `dependencies` /
 * `devDependencies`: `peerDependencies` and `optionalDependencies` also
 * resolve at install time (pnpm auto-installs peers by default), so a driver
 * package declared in either would be just as real a boundary leak.
 */
function declaredDependencies(workspace: string): string[] {
  const manifest = JSON.parse(
    readFileSync(join(repoRoot, workspace, 'package.json'), 'utf8'),
  ) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  };
  return Object.keys({
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.peerDependencies,
    ...manifest.optionalDependencies,
  });
}

describe('database driver dependency boundary', () => {
  it('discovers every workspace in the monorepo', () => {
    const dirs = workspaceDirs();
    expect(dirs).toContain(OWNER);
    expect(dirs).toContain('apps/discord-bot');
    expect(dirs).toContain('packages/game-data');
    expect(dirs).toContain('tools/review-race');
    expect(dirs.length).toBeGreaterThan(15);
  });

  it('lets packages/db declare the driver packages', () => {
    const declared = declaredDependencies(OWNER);
    for (const pkg of DRIVER_PACKAGES) {
      expect(declared).toContain(pkg);
    }
  });

  it('lets no other workspace declare a database driver package', () => {
    const offenders = workspaceDirs()
      .filter((workspace) => workspace !== OWNER)
      .flatMap((workspace) => {
        const declared = declaredDependencies(workspace);
        return DRIVER_PACKAGES.filter((pkg) => declared.includes(pkg)).map(
          (pkg) => `${workspace} declares ${pkg}`,
        );
      });
    expect(offenders).toEqual([]);
  });
});
