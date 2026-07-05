DROP INDEX "critter_profiles_emoji_name_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "critter_profiles_emoji_norm_name_idx" ON "critter_profiles" ("emoji", lower(trim("name")));
