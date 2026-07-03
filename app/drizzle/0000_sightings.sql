CREATE TABLE "sightings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"emoji" text NOT NULL,
	"name" text,
	"sighted_on" date NOT NULL,
	"sighted_time" text,
	"place" text,
	"comment" text,
	"photo_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
