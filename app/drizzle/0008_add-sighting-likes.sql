CREATE TABLE "sighting_likes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sighting_id" uuid NOT NULL,
	"device_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sighting_likes_sighting_device" UNIQUE("sighting_id","device_id")
);
--> statement-breakpoint
ALTER TABLE "sighting_likes" ADD CONSTRAINT "sighting_likes_sighting_id_sightings_id_fk" FOREIGN KEY ("sighting_id") REFERENCES "public"."sightings"("id") ON DELETE cascade ON UPDATE no action;