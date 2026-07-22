CREATE TYPE "game_data"."weather_type" AS ENUM('dungeon', 'sweltering_heat', 'very_sunny', 'nice', 'pouring_rain', 'blizzard', 'morning_dew', 'blossoming_flowers', 'misty_morning', 'high_winds', 'perfect_conditions', 'melting_astrogranite', 'blinding_rays', 'monsoon', 'leaf_strewn_pitch', 'autumnal_chill', 'strong_winds', 'cold_winds', 'freezing', 'heavy_snow', 'unknown');--> statement-breakpoint
ALTER TABLE "game_data"."match_events" DISABLE TRIGGER match_events_versioning;--> statement-breakpoint
ALTER TABLE "game_data"."match_events" ALTER COLUMN "weather_type" SET DATA TYPE "game_data"."weather_type" USING (
  CASE "weather_type"
    WHEN 0 THEN 'dungeon'
    WHEN 10 THEN 'sweltering_heat'
    WHEN 20 THEN 'very_sunny'
    WHEN 30 THEN 'nice'
    WHEN 40 THEN 'pouring_rain'
    WHEN 50 THEN 'blizzard'
    WHEN 100 THEN 'morning_dew'
    WHEN 101 THEN 'blossoming_flowers'
    WHEN 102 THEN 'misty_morning'
    WHEN 103 THEN 'high_winds'
    WHEN 104 THEN 'perfect_conditions'
    WHEN 105 THEN 'melting_astrogranite'
    WHEN 106 THEN 'blinding_rays'
    WHEN 107 THEN 'monsoon'
    WHEN 108 THEN 'leaf_strewn_pitch'
    WHEN 109 THEN 'autumnal_chill'
    WHEN 110 THEN 'strong_winds'
    WHEN 111 THEN 'cold_winds'
    WHEN 112 THEN 'freezing'
    WHEN 113 THEN 'heavy_snow'
    WHEN NULL THEN NULL
    ELSE 'unknown'
  END
)::"game_data"."weather_type";--> statement-breakpoint
ALTER TABLE "game_data"."match_events_history" ALTER COLUMN "weather_type" SET DATA TYPE "game_data"."weather_type" USING (
  CASE "weather_type"
    WHEN 0 THEN 'dungeon'
    WHEN 10 THEN 'sweltering_heat'
    WHEN 20 THEN 'very_sunny'
    WHEN 30 THEN 'nice'
    WHEN 40 THEN 'pouring_rain'
    WHEN 50 THEN 'blizzard'
    WHEN 100 THEN 'morning_dew'
    WHEN 101 THEN 'blossoming_flowers'
    WHEN 102 THEN 'misty_morning'
    WHEN 103 THEN 'high_winds'
    WHEN 104 THEN 'perfect_conditions'
    WHEN 105 THEN 'melting_astrogranite'
    WHEN 106 THEN 'blinding_rays'
    WHEN 107 THEN 'monsoon'
    WHEN 108 THEN 'leaf_strewn_pitch'
    WHEN 109 THEN 'autumnal_chill'
    WHEN 110 THEN 'strong_winds'
    WHEN 111 THEN 'cold_winds'
    WHEN 112 THEN 'freezing'
    WHEN 113 THEN 'heavy_snow'
    WHEN NULL THEN NULL
    ELSE 'unknown'
  END
)::"game_data"."weather_type";--> statement-breakpoint
ALTER TABLE "game_data"."match_events" ENABLE TRIGGER match_events_versioning;
