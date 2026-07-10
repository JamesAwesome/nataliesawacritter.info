ALTER TABLE "emoji_requests" ADD COLUMN "handled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "emoji_requests" ADD COLUMN "pr_url" text;--> statement-breakpoint
ALTER TABLE "emoji_requests" ADD COLUMN "outcome" text;