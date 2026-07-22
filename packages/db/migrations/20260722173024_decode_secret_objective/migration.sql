CREATE TYPE "game_data"."secret_objective" AS ENUM('red_card', 'didnt_need_them_anyway', 'going_alone', 'fouling_frenzy', 'going_surfing', 'ganging_up', 'whoops', 'not_so_fast', 'timely_tackle', 'precision_passing', 'hit_em_hard', 'just_a_little_further', 'go_long', 'nuffle_favors_the_bold', 'all_according_to_plan', 'headtaker', 'unknown');--> statement-breakpoint
ALTER TABLE "game_data"."match_events" DISABLE TRIGGER match_events_versioning;--> statement-breakpoint
ALTER TABLE "game_data"."match_events" ALTER COLUMN "secret_objective" SET DATA TYPE "game_data"."secret_objective" USING (
  CASE
    WHEN "secret_objective" IS NULL THEN NULL
    WHEN "secret_objective" = 1 THEN 'red_card'
    WHEN "secret_objective" = 2 THEN 'didnt_need_them_anyway'
    WHEN "secret_objective" = 3 THEN 'going_alone'
    WHEN "secret_objective" = 4 THEN 'fouling_frenzy'
    WHEN "secret_objective" = 5 THEN 'going_surfing'
    WHEN "secret_objective" = 6 THEN 'ganging_up'
    WHEN "secret_objective" = 7 THEN 'whoops'
    WHEN "secret_objective" = 8 THEN 'not_so_fast'
    WHEN "secret_objective" = 9 THEN 'timely_tackle'
    WHEN "secret_objective" = 10 THEN 'precision_passing'
    WHEN "secret_objective" = 11 THEN 'hit_em_hard'
    WHEN "secret_objective" = 12 THEN 'just_a_little_further'
    WHEN "secret_objective" = 13 THEN 'go_long'
    WHEN "secret_objective" = 14 THEN 'nuffle_favors_the_bold'
    WHEN "secret_objective" = 15 THEN 'all_according_to_plan'
    WHEN "secret_objective" = 16 THEN 'headtaker'
    ELSE 'unknown'
  END
)::"game_data"."secret_objective";--> statement-breakpoint
ALTER TABLE "game_data"."match_events_history" ALTER COLUMN "secret_objective" SET DATA TYPE "game_data"."secret_objective" USING (
  CASE
    WHEN "secret_objective" IS NULL THEN NULL
    WHEN "secret_objective" = 1 THEN 'red_card'
    WHEN "secret_objective" = 2 THEN 'didnt_need_them_anyway'
    WHEN "secret_objective" = 3 THEN 'going_alone'
    WHEN "secret_objective" = 4 THEN 'fouling_frenzy'
    WHEN "secret_objective" = 5 THEN 'going_surfing'
    WHEN "secret_objective" = 6 THEN 'ganging_up'
    WHEN "secret_objective" = 7 THEN 'whoops'
    WHEN "secret_objective" = 8 THEN 'not_so_fast'
    WHEN "secret_objective" = 9 THEN 'timely_tackle'
    WHEN "secret_objective" = 10 THEN 'precision_passing'
    WHEN "secret_objective" = 11 THEN 'hit_em_hard'
    WHEN "secret_objective" = 12 THEN 'just_a_little_further'
    WHEN "secret_objective" = 13 THEN 'go_long'
    WHEN "secret_objective" = 14 THEN 'nuffle_favors_the_bold'
    WHEN "secret_objective" = 15 THEN 'all_according_to_plan'
    WHEN "secret_objective" = 16 THEN 'headtaker'
    ELSE 'unknown'
  END
)::"game_data"."secret_objective";--> statement-breakpoint
ALTER TABLE "game_data"."match_events" ENABLE TRIGGER match_events_versioning;
