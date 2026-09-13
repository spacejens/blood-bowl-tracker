import { Test } from '@nestjs/testing';
import type { ChatInputCommandInteraction } from 'discord.js';
import { beforeEach, describe, expect, it } from 'vitest';

import { MemberRoleAccessService } from './member-role-access.service';

type Member = ChatInputCommandInteraction['member'];

const ROLE_ID = '900000000000000000';

/** A cached `GuildMember`: `.roles` is a manager with a keyed cache. */
function cachedMember(roleIds: string[]): Member {
  return { roles: { cache: new Set(roleIds) } } as unknown as Member;
}

/** A raw `APIInteractionGuildMember`: `.roles` is an array of snowflakes. */
function rawMember(roleIds: string[]): Member {
  return { roles: roleIds } as unknown as Member;
}

describe('MemberRoleAccessService', () => {
  let service: MemberRoleAccessService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [MemberRoleAccessService],
    }).compile();
    service = moduleRef.get(MemberRoleAccessService);
  });

  it('finds the role on a cached guild member', () => {
    expect(service.hasRole(cachedMember(['other', ROLE_ID]), ROLE_ID)).toBe(
      true,
    );
  });

  it('reports a cached guild member without the role', () => {
    expect(service.hasRole(cachedMember(['other']), ROLE_ID)).toBe(false);
  });

  it('finds the role on a raw interaction guild member', () => {
    expect(service.hasRole(rawMember(['other', ROLE_ID]), ROLE_ID)).toBe(true);
  });

  it('reports a raw interaction guild member without the role', () => {
    expect(service.hasRole(rawMember(['other']), ROLE_ID)).toBe(false);
  });

  it('reports no role for a null member, as in a direct message', () => {
    expect(service.hasRole(null, ROLE_ID)).toBe(false);
  });

  it('reports no role for an undefined member', () => {
    expect(service.hasRole(undefined as unknown as Member, ROLE_ID)).toBe(
      false,
    );
  });
});
