import { Module } from '@nestjs/common';

import { SlashCommandRegistryService } from './slash-command-registry.service';

/**
 * `SlashCommandRegistryService` is a shared singleton: every command service
 * registers against the exact same instance during `onModuleInit`, and
 * `LeaderElectionService` (in `AppModule`) later flushes that same instance's
 * collected list to Discord. `SlashCommandsModule` and `debug/DebugModule`
 * both provide command services that need it, and `SlashCommandsModule`
 * imports `DebugModule` — so the registry can't live directly in either
 * module's own `providers` without either duplicating the instance or
 * creating a circular import. Pulling it into this small module, imported by
 * both, keeps it a single Nest-managed instance shared across the whole
 * dependency graph.
 */
@Module({
  providers: [SlashCommandRegistryService],
  exports: [SlashCommandRegistryService],
})
export class SlashCommandRegistryModule {}
