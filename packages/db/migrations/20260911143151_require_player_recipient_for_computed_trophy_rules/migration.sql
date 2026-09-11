ALTER TABLE "game_data"."trophies" DROP CONSTRAINT "trophies_award_rule", ADD CONSTRAINT "trophies_award_rule" CHECK ((
        "award_rule_kind" IN ('direct_source', 'manual')
        AND "award_procedure" IS NOT NULL
        AND "award_rule_role" IS NULL
        AND "award_rule_tie_cutoff" IS NULL
        AND "award_rule_threshold" IS NULL
        AND "award_rule_measure" IS NULL
      ) OR (
        "award_rule_kind" IN ('max_count', 'max_spp_sum')
        AND "recipient_kind" = 'player'
        AND "award_procedure" IS NULL
        AND "award_rule_role" IS NOT NULL
        AND "award_rule_tie_cutoff" IS NOT NULL
        AND "award_rule_threshold" IS NULL
        AND "award_rule_measure" IS NULL
      ) OR (
        "award_rule_kind" = 'career_threshold'
        AND "recipient_kind" = 'player'
        AND "award_procedure" IS NULL
        AND "award_rule_role" IS NOT NULL
        AND "award_rule_tie_cutoff" IS NULL
        AND "award_rule_threshold" IS NOT NULL
        AND "award_rule_measure" IS NOT NULL
      ));