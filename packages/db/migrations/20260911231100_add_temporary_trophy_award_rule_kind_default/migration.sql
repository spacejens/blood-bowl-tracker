-- Temporary deployment aid: the default lets an app release that predates
-- trophies.award_rule_kind keep inserting trophies while a deployment is
-- still rolling out. Drop it once every deployment runs app code that always
-- supplies the column, so an uncurated trophy fails loudly rather than
-- silently classifying as 'direct_source' and never being computed.
ALTER TABLE "game_data"."trophies" ALTER COLUMN "award_rule_kind" SET DEFAULT 'direct_source'::"game_data"."trophy_award_rule_kind";
