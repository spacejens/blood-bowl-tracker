CREATE SCHEMA "discord_bot_usage";
--> statement-breakpoint
CREATE TYPE "discord_bot_usage"."interaction_kind" AS ENUM('command', 'button', 'select_menu');--> statement-breakpoint
CREATE TYPE "discord_bot_usage"."interaction_outcome" AS ENUM('success', 'failure');--> statement-breakpoint
CREATE TABLE "discord_bot_usage"."channels" (
	"id" serial PRIMARY KEY,
	"discord_id" text NOT NULL UNIQUE,
	"guild_id" integer,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"history_version" integer DEFAULT 1 NOT NULL,
	"history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discord_bot_usage"."channels_history" (LIKE "discord_bot_usage"."channels");
--> statement-breakpoint
CREATE TABLE "discord_bot_usage"."guild_members" (
	"id" serial PRIMARY KEY,
	"user_id" integer NOT NULL,
	"guild_id" integer NOT NULL,
	"nickname" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"history_version" integer DEFAULT 1 NOT NULL,
	"history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL,
	CONSTRAINT "guild_members_user_guild_unique" UNIQUE("user_id","guild_id")
);
--> statement-breakpoint
CREATE TABLE "discord_bot_usage"."guild_members_history" (LIKE "discord_bot_usage"."guild_members");
--> statement-breakpoint
CREATE TABLE "discord_bot_usage"."guilds" (
	"id" serial PRIMARY KEY,
	"discord_id" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"history_version" integer DEFAULT 1 NOT NULL,
	"history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discord_bot_usage"."guilds_history" (LIKE "discord_bot_usage"."guilds");
--> statement-breakpoint
CREATE TABLE "discord_bot_usage"."interaction_event_parameters" (
	"id" serial PRIMARY KEY,
	"event_id" integer NOT NULL,
	"key" text NOT NULL,
	"value" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"history_version" integer DEFAULT 1 NOT NULL,
	"history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discord_bot_usage"."interaction_event_parameters_history" (LIKE "discord_bot_usage"."interaction_event_parameters");
--> statement-breakpoint
CREATE TABLE "discord_bot_usage"."interaction_events" (
	"id" serial PRIMARY KEY,
	"interaction_type_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"guild_id" integer,
	"channel_id" integer NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"outcome" "discord_bot_usage"."interaction_outcome" NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"history_version" integer DEFAULT 1 NOT NULL,
	"history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discord_bot_usage"."interaction_events_history" (LIKE "discord_bot_usage"."interaction_events");
--> statement-breakpoint
CREATE TABLE "discord_bot_usage"."interaction_types" (
	"id" serial PRIMARY KEY,
	"kind" "discord_bot_usage"."interaction_kind" NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"history_version" integer DEFAULT 1 NOT NULL,
	"history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL,
	CONSTRAINT "interaction_types_kind_name_unique" UNIQUE("kind","name")
);
--> statement-breakpoint
CREATE TABLE "discord_bot_usage"."interaction_types_history" (LIKE "discord_bot_usage"."interaction_types");
--> statement-breakpoint
CREATE TABLE "discord_bot_usage"."users" (
	"id" serial PRIMARY KEY,
	"discord_id" text NOT NULL UNIQUE,
	"username" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"history_version" integer DEFAULT 1 NOT NULL,
	"history_period" tstzrange DEFAULT tstzrange(now(), null) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discord_bot_usage"."users_history" (LIKE "discord_bot_usage"."users");
--> statement-breakpoint
ALTER TABLE "discord_bot_usage"."channels" ADD CONSTRAINT "channels_guild_id_guilds_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "discord_bot_usage"."guilds"("id");--> statement-breakpoint
ALTER TABLE "discord_bot_usage"."guild_members" ADD CONSTRAINT "guild_members_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "discord_bot_usage"."users"("id");--> statement-breakpoint
ALTER TABLE "discord_bot_usage"."guild_members" ADD CONSTRAINT "guild_members_guild_id_guilds_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "discord_bot_usage"."guilds"("id");--> statement-breakpoint
ALTER TABLE "discord_bot_usage"."interaction_event_parameters" ADD CONSTRAINT "interaction_event_parameters_YgLEesNUvVZE_fkey" FOREIGN KEY ("event_id") REFERENCES "discord_bot_usage"."interaction_events"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "discord_bot_usage"."interaction_events" ADD CONSTRAINT "interaction_events_PkqKEaGRucXv_fkey" FOREIGN KEY ("interaction_type_id") REFERENCES "discord_bot_usage"."interaction_types"("id");--> statement-breakpoint
ALTER TABLE "discord_bot_usage"."interaction_events" ADD CONSTRAINT "interaction_events_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "discord_bot_usage"."users"("id");--> statement-breakpoint
ALTER TABLE "discord_bot_usage"."interaction_events" ADD CONSTRAINT "interaction_events_guild_id_guilds_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "discord_bot_usage"."guilds"("id");--> statement-breakpoint
ALTER TABLE "discord_bot_usage"."interaction_events" ADD CONSTRAINT "interaction_events_channel_id_channels_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "discord_bot_usage"."channels"("id");
--> statement-breakpoint
ALTER TABLE "discord_bot_usage"."channels_history" ADD CONSTRAINT "channels_history_pkey" PRIMARY KEY ("id", "history_version");
--> statement-breakpoint
ALTER TABLE "discord_bot_usage"."channels_history" ADD CONSTRAINT "channels_history_id_fkey" FOREIGN KEY ("id") REFERENCES "discord_bot_usage"."channels"("id") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
DROP TRIGGER IF EXISTS channels_versioning ON "discord_bot_usage"."channels";
--> statement-breakpoint
CREATE TRIGGER channels_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "discord_bot_usage"."channels"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'discord_bot_usage.channels_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS channels_set_updated_at ON "discord_bot_usage"."channels";
--> statement-breakpoint
CREATE TRIGGER channels_set_updated_at
  BEFORE UPDATE ON "discord_bot_usage"."channels"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
--> statement-breakpoint
ALTER TABLE "discord_bot_usage"."guild_members_history" ADD CONSTRAINT "guild_members_history_pkey" PRIMARY KEY ("id", "history_version");
--> statement-breakpoint
ALTER TABLE "discord_bot_usage"."guild_members_history" ADD CONSTRAINT "guild_members_history_id_fkey" FOREIGN KEY ("id") REFERENCES "discord_bot_usage"."guild_members"("id") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
DROP TRIGGER IF EXISTS guild_members_versioning ON "discord_bot_usage"."guild_members";
--> statement-breakpoint
CREATE TRIGGER guild_members_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "discord_bot_usage"."guild_members"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'discord_bot_usage.guild_members_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS guild_members_set_updated_at ON "discord_bot_usage"."guild_members";
--> statement-breakpoint
CREATE TRIGGER guild_members_set_updated_at
  BEFORE UPDATE ON "discord_bot_usage"."guild_members"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
--> statement-breakpoint
ALTER TABLE "discord_bot_usage"."guilds_history" ADD CONSTRAINT "guilds_history_pkey" PRIMARY KEY ("id", "history_version");
--> statement-breakpoint
ALTER TABLE "discord_bot_usage"."guilds_history" ADD CONSTRAINT "guilds_history_id_fkey" FOREIGN KEY ("id") REFERENCES "discord_bot_usage"."guilds"("id") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
DROP TRIGGER IF EXISTS guilds_versioning ON "discord_bot_usage"."guilds";
--> statement-breakpoint
CREATE TRIGGER guilds_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "discord_bot_usage"."guilds"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'discord_bot_usage.guilds_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS guilds_set_updated_at ON "discord_bot_usage"."guilds";
--> statement-breakpoint
CREATE TRIGGER guilds_set_updated_at
  BEFORE UPDATE ON "discord_bot_usage"."guilds"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
--> statement-breakpoint
ALTER TABLE "discord_bot_usage"."interaction_event_parameters_history" ADD CONSTRAINT "interaction_event_parameters_history_pkey" PRIMARY KEY ("id", "history_version");
--> statement-breakpoint
ALTER TABLE "discord_bot_usage"."interaction_event_parameters_history" ADD CONSTRAINT "interaction_event_parameters_history_id_fkey" FOREIGN KEY ("id") REFERENCES "discord_bot_usage"."interaction_event_parameters"("id") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
DROP TRIGGER IF EXISTS interaction_event_parameters_versioning ON "discord_bot_usage"."interaction_event_parameters";
--> statement-breakpoint
CREATE TRIGGER interaction_event_parameters_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "discord_bot_usage"."interaction_event_parameters"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'discord_bot_usage.interaction_event_parameters_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS interaction_event_parameters_set_updated_at ON "discord_bot_usage"."interaction_event_parameters";
--> statement-breakpoint
CREATE TRIGGER interaction_event_parameters_set_updated_at
  BEFORE UPDATE ON "discord_bot_usage"."interaction_event_parameters"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
--> statement-breakpoint
ALTER TABLE "discord_bot_usage"."interaction_events_history" ADD CONSTRAINT "interaction_events_history_pkey" PRIMARY KEY ("id", "history_version");
--> statement-breakpoint
ALTER TABLE "discord_bot_usage"."interaction_events_history" ADD CONSTRAINT "interaction_events_history_id_fkey" FOREIGN KEY ("id") REFERENCES "discord_bot_usage"."interaction_events"("id") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
DROP TRIGGER IF EXISTS interaction_events_versioning ON "discord_bot_usage"."interaction_events";
--> statement-breakpoint
CREATE TRIGGER interaction_events_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "discord_bot_usage"."interaction_events"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'discord_bot_usage.interaction_events_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS interaction_events_set_updated_at ON "discord_bot_usage"."interaction_events";
--> statement-breakpoint
CREATE TRIGGER interaction_events_set_updated_at
  BEFORE UPDATE ON "discord_bot_usage"."interaction_events"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
--> statement-breakpoint
ALTER TABLE "discord_bot_usage"."interaction_types_history" ADD CONSTRAINT "interaction_types_history_pkey" PRIMARY KEY ("id", "history_version");
--> statement-breakpoint
ALTER TABLE "discord_bot_usage"."interaction_types_history" ADD CONSTRAINT "interaction_types_history_id_fkey" FOREIGN KEY ("id") REFERENCES "discord_bot_usage"."interaction_types"("id") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
DROP TRIGGER IF EXISTS interaction_types_versioning ON "discord_bot_usage"."interaction_types";
--> statement-breakpoint
CREATE TRIGGER interaction_types_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "discord_bot_usage"."interaction_types"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'discord_bot_usage.interaction_types_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS interaction_types_set_updated_at ON "discord_bot_usage"."interaction_types";
--> statement-breakpoint
CREATE TRIGGER interaction_types_set_updated_at
  BEFORE UPDATE ON "discord_bot_usage"."interaction_types"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
--> statement-breakpoint
ALTER TABLE "discord_bot_usage"."users_history" ADD CONSTRAINT "users_history_pkey" PRIMARY KEY ("id", "history_version");
--> statement-breakpoint
ALTER TABLE "discord_bot_usage"."users_history" ADD CONSTRAINT "users_history_id_fkey" FOREIGN KEY ("id") REFERENCES "discord_bot_usage"."users"("id") DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
DROP TRIGGER IF EXISTS users_versioning ON "discord_bot_usage"."users";
--> statement-breakpoint
CREATE TRIGGER users_versioning
  BEFORE INSERT OR UPDATE OR DELETE ON "discord_bot_usage"."users"
  FOR EACH ROW EXECUTE PROCEDURE versioning(
    'history_period', 'discord_bot_usage.users_history',
    true, true, true, false, true, 'history_version'
  );
--> statement-breakpoint
DROP TRIGGER IF EXISTS users_set_updated_at ON "discord_bot_usage"."users";
--> statement-breakpoint
CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON "discord_bot_usage"."users"
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
