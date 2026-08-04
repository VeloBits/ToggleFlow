CREATE TYPE "public"."flag_value_type" AS ENUM('boolean', 'string', 'string_enum');--> statement-breakpoint
ALTER TABLE "flag_states" ADD COLUMN "value" jsonb;--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN "value_type" "flag_value_type" DEFAULT 'boolean' NOT NULL;--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN "enum_options" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN "default_value" jsonb;--> statement-breakpoint
ALTER TABLE "tools" ADD CONSTRAINT "tools_enum_options_required" CHECK ("tools"."value_type" <> 'string_enum' OR cardinality("tools"."enum_options") > 0);