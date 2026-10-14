import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { UsesRefClassifierService } from './uses-ref-classifier.service';

const SHA = '3d3c42e5aac5ba805825da76410c181273ba90b1';
const DIGEST = 'ab'.repeat(32);

describe('UsesRefClassifierService', () => {
  let service: UsesRefClassifierService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [UsesRefClassifierService],
    }).compile();
    service = moduleRef.get(UsesRefClassifierService);
  });

  it.each([
    ['a step action pinned to a SHA', `actions/checkout@${SHA}`],
    [
      'an action in a repo subdirectory pinned to a SHA',
      `superfly/flyctl-actions/setup-flyctl@${SHA}`,
    ],
    [
      'a remote reusable workflow pinned to a SHA',
      `octo-org/shared/.github/workflows/build.yml@${SHA}`,
    ],
    ['a local action', './.github/actions/setup'],
    ['a local reusable workflow', './.github/workflows/reusable.yml'],
    ['a docker image with a sha256 digest', `docker://alpine@sha256:${DIGEST}`],
    [
      'a tagged docker image that also carries a digest',
      `docker://alpine:3.20@sha256:${DIGEST}`,
    ],
  ])('accepts %s', (_label, uses) => {
    expect(service.isPinned(uses)).toBe(true);
  });

  it.each([
    ['a major-version tag', 'actions/checkout@v7'],
    ['a minor-version tag', 'superfly/flyctl-actions/setup-flyctl@1.6'],
    ['a branch', 'actions/checkout@main'],
    ['a reference with no ref at all', 'actions/checkout'],
    [
      'a remote reusable workflow pinned to a tag',
      'octo-org/shared/.github/workflows/build.yml@v1',
    ],
    ['a SHA one character too short', `actions/checkout@${SHA.slice(0, 39)}`],
    ['a SHA one character too long', `actions/checkout@${SHA}0`],
    [
      'a SHA with uppercase characters',
      `actions/checkout@${SHA.toUpperCase()}`,
    ],
    ['a SHA without an owner', `checkout@${SHA}`],
    ['a docker image by tag only', 'docker://alpine:3.20'],
    [
      'a docker digest of the wrong length',
      `docker://alpine@sha256:${DIGEST.slice(1)}`,
    ],
    ['an empty value', ''],
  ])('rejects %s', (_label, uses) => {
    expect(service.isPinned(uses)).toBe(false);
  });
});
