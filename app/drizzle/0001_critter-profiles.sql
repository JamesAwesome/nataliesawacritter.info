CREATE TABLE "critter_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"emoji" text NOT NULL,
	"name" text NOT NULL,
	"place" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "critter_profiles_emoji_name_idx" ON "critter_profiles" USING btree ("emoji","name");