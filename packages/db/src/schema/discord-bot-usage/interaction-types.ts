import {
  INTERACTION_KINDS,
  INTERACTION_OUTCOMES,
} from '@blood-bowl-tracker/domain-enums';
import { serial, text, unique } from 'drizzle-orm/pg-core';

import { historyTrackedTable } from '../history';
import { discordBotUsage } from './pg-schema';

export const interactionKindEnum = discordBotUsage.enum(
  'interaction_kind',
  INTERACTION_KINDS,
);

export type InteractionKind = (typeof interactionKindEnum.enumValues)[number];

export const interactionOutcomeEnum = discordBotUsage.enum(
  'interaction_outcome',
  INTERACTION_OUTCOMES,
);

export type InteractionOutcome =
  (typeof interactionOutcomeEnum.enumValues)[number];

/**
 * The catalog of things that can be triggered: one row per slash command, and
 * one per registered button/select-menu customId prefix. Rows are created
 * lazily the first time each is seen. `name` never changes for a given
 * `(kind, name)` pair, so there is nothing to update after insert.
 *
 * Joining an event to its type is what lets a query group by kind as well as
 * by the specific command or component.
 */
const interactionTypesTable = historyTrackedTable({
  schema: discordBotUsage,
  name: 'interaction_types',
  columns: {
    id: serial('id').primaryKey(),
    kind: interactionKindEnum('kind').notNull(),
    name: text('name').notNull(),
  },
  extraConfig: (t) => ({
    uniqueKindName: unique('interaction_types_kind_name_unique').on(
      t.kind,
      t.name,
    ),
  }),
});

export const interactionTypes = interactionTypesTable.table;
export const interactionTypesHistory = interactionTypesTable.historyTable;

export type InteractionType = typeof interactionTypes.$inferSelect;
export type NewInteractionType = typeof interactionTypes.$inferInsert;
