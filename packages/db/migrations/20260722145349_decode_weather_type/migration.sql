CREATE TYPE "game_data"."weather_type" AS ENUM('dungeon', 'sweltering_heat', 'very_sunny', 'nice', 'pouring_rain', 'blizzard', 'morning_dew', 'blossoming_flowers', 'misty_morning', 'high_winds', 'perfect_conditions', 'melting_astrogranite', 'blinding_rays', 'monsoon', 'leaf_strewn_pitch', 'autumnal_chill', 'strong_winds', 'cold_winds', 'freezing', 'heavy_snow', 'unknown');--> statement-breakpoint
ALTER TABLE "game_data"."match_events" DISABLE TRIGGER match_events_versioning;--> statement-breakpoint
ALTER TABLE "game_data"."match_events" ALTER COLUMN "weather_type" SET DATA TYPE "game_data"."weather_type" USING (
  CASE
    WHEN "weather_type" IS NULL THEN NULL
    WHEN "weather_type" = 0 THEN 'dungeon'
    WHEN "weather_type" = 10 THEN 'sweltering_heat'
    WHEN "weather_type" = 20 THEN 'very_sunny'
    WHEN "weather_type" = 30 THEN 'nice'
    WHEN "weather_type" = 40 THEN 'pouring_rain'
    WHEN "weather_type" = 50 THEN 'blizzard'
    WHEN "weather_type" = 100 THEN 'morning_dew'
    WHEN "weather_type" = 101 THEN 'blossoming_flowers'
    WHEN "weather_type" = 102 THEN 'misty_morning'
    WHEN "weather_type" = 103 THEN 'high_winds'
    WHEN "weather_type" = 104 THEN 'perfect_conditions'
    WHEN "weather_type" = 105 THEN 'melting_astrogranite'
    WHEN "weather_type" = 106 THEN 'blinding_rays'
    WHEN "weather_type" = 107 THEN 'monsoon'
    WHEN "weather_type" = 108 THEN 'leaf_strewn_pitch'
    WHEN "weather_type" = 109 THEN 'autumnal_chill'
    WHEN "weather_type" = 110 THEN 'strong_winds'
    WHEN "weather_type" = 111 THEN 'cold_winds'
    WHEN "weather_type" = 112 THEN 'freezing'
    WHEN "weather_type" = 113 THEN 'heavy_snow'
    ELSE 'unknown'
  END
)::"game_data"."weather_type";--> statement-breakpoint
ALTER TABLE "game_data"."match_events_history" ALTER COLUMN "weather_type" SET DATA TYPE "game_data"."weather_type" USING (
  CASE
    WHEN "weather_type" IS NULL THEN NULL
    WHEN "weather_type" = 0 THEN 'dungeon'
    WHEN "weather_type" = 10 THEN 'sweltering_heat'
    WHEN "weather_type" = 20 THEN 'very_sunny'
    WHEN "weather_type" = 30 THEN 'nice'
    WHEN "weather_type" = 40 THEN 'pouring_rain'
    WHEN "weather_type" = 50 THEN 'blizzard'
    WHEN "weather_type" = 100 THEN 'morning_dew'
    WHEN "weather_type" = 101 THEN 'blossoming_flowers'
    WHEN "weather_type" = 102 THEN 'misty_morning'
    WHEN "weather_type" = 103 THEN 'high_winds'
    WHEN "weather_type" = 104 THEN 'perfect_conditions'
    WHEN "weather_type" = 105 THEN 'melting_astrogranite'
    WHEN "weather_type" = 106 THEN 'blinding_rays'
    WHEN "weather_type" = 107 THEN 'monsoon'
    WHEN "weather_type" = 108 THEN 'leaf_strewn_pitch'
    WHEN "weather_type" = 109 THEN 'autumnal_chill'
    WHEN "weather_type" = 110 THEN 'strong_winds'
    WHEN "weather_type" = 111 THEN 'cold_winds'
    WHEN "weather_type" = 112 THEN 'freezing'
    WHEN "weather_type" = 113 THEN 'heavy_snow'
    ELSE 'unknown'
  END
)::"game_data"."weather_type";--> statement-breakpoint
ALTER TABLE "game_data"."match_events" ENABLE TRIGGER match_events_versioning;
