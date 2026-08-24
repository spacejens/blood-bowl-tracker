-- competitions_history.start_date is tightened alongside its tracked column.
-- db-generate.ts's rewriteHistorySetNotNull normally strips a history-table
-- SET NOT NULL, because history rows are immutable snapshots that can never
-- be backfilled; this statement was restored by hand as a one-time catch-up,
-- made safe by the coordinated database drop and re-import.
-- That stripping remains the correct default for every other history column.
ALTER TABLE "game_data"."competitions" ALTER COLUMN "start_date" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "game_data"."competitions_history" ALTER COLUMN "start_date" SET NOT NULL;