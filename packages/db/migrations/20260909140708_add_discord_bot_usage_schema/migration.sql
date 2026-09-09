CREATE SCHEMA "discord_bot_usage";
--> statement-breakpoint
CREATE TYPE "discord_bot_usage"."interaction_kind" AS ENUM('command', 'button', 'select_menu');--> statement-breakpoint
CREATE TYPE "discord_bot_usage"."interaction_outcome" AS ENUM('success', 'failure');--> statement-breakpoint
CREATE TABLE "discord_bot_usage"."channels" (
	"id" serial PRIMARY KEY,
	"discord_id" text NOT NULL UNIQUE,
	"guild_id" integer,
	"name" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discord_bot_usage"."guild_members" (
	"id" serial PRIMARY KEY,
	"user_id" integer NOT NULL,
	"guild_id" integer NOT NULL,
	"nickname" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guild_members_user_guild_unique" UNIQUE("user_id","guild_id")
);
--> statement-breakpoint
CREATE TABLE "discord_bot_usage"."guilds" (
	"id" serial PRIMARY KEY,
	"discord_id" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discord_bot_usage"."interaction_event_parameters" (
	"id" serial PRIMARY KEY,
	"event_id" integer NOT NULL,
	"key" text NOT NULL,
	"value" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discord_bot_usage"."interaction_events" (
	"id" serial PRIMARY KEY,
	"interaction_type_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"guild_id" integer,
	"channel_id" integer NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"outcome" "discord_bot_usage"."interaction_outcome" NOT NULL,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "discord_bot_usage"."interaction_types" (
	"id" serial PRIMARY KEY,
	"kind" "discord_bot_usage"."interaction_kind" NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "interaction_types_kind_name_unique" UNIQUE("kind","name")
);
--> statement-breakpoint
CREATE TABLE "discord_bot_usage"."users" (
	"id" serial PRIMARY KEY,
	"discord_id" text NOT NULL UNIQUE,
	"username" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "discord_bot_usage"."channels" ADD CONSTRAINT "channels_guild_id_guilds_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "discord_bot_usage"."guilds"("id");--> statement-breakpoint
ALTER TABLE "discord_bot_usage"."guild_members" ADD CONSTRAINT "guild_members_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "discord_bot_usage"."users"("id");--> statement-breakpoint
ALTER TABLE "discord_bot_usage"."guild_members" ADD CONSTRAINT "guild_members_guild_id_guilds_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "discord_bot_usage"."guilds"("id");--> statement-breakpoint
ALTER TABLE "discord_bot_usage"."interaction_event_parameters" ADD CONSTRAINT "interaction_event_parameters_YgLEesNUvVZE_fkey" FOREIGN KEY ("event_id") REFERENCES "discord_bot_usage"."interaction_events"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "discord_bot_usage"."interaction_events" ADD CONSTRAINT "interaction_events_PkqKEaGRucXv_fkey" FOREIGN KEY ("interaction_type_id") REFERENCES "discord_bot_usage"."interaction_types"("id");--> statement-breakpoint
ALTER TABLE "discord_bot_usage"."interaction_events" ADD CONSTRAINT "interaction_events_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "discord_bot_usage"."users"("id");--> statement-breakpoint
ALTER TABLE "discord_bot_usage"."interaction_events" ADD CONSTRAINT "interaction_events_guild_id_guilds_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "discord_bot_usage"."guilds"("id");--> statement-breakpoint
ALTER TABLE "discord_bot_usage"."interaction_events" ADD CONSTRAINT "interaction_events_channel_id_channels_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "discord_bot_usage"."channels"("id");