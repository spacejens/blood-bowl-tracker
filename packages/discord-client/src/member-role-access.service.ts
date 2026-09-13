import { Injectable } from '@nestjs/common';
import type { ChatInputCommandInteraction } from 'discord.js';

/**
 * Answers whether the member who triggered an interaction holds a given
 * Discord role. Pure and dependency-free: it inspects only the payload it is
 * handed.
 *
 * `interaction.member` is a cached `GuildMember` whose `.roles` is a role
 * manager with a `.cache` collection when the guild is already known to the
 * client, and the raw `APIInteractionGuildMember` whose `.roles` is a plain
 * array of role snowflakes otherwise. Both are handled, the same way
 * `DiscordClientService.memberNickname` handles the same two shapes.
 *
 * A missing member means the interaction did not come from a guild — a direct
 * message with the bot — where there is no guild role to verify against, so
 * the answer is no.
 */
@Injectable()
export class MemberRoleAccessService {
  hasRole(
    member: ChatInputCommandInteraction['member'],
    roleId: string,
  ): boolean {
    if (!member) {
      return false;
    }
    if ('cache' in member.roles) {
      return member.roles.cache.has(roleId);
    }
    return member.roles.includes(roleId);
  }
}
