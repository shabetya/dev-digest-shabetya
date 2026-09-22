ALTER TABLE "pr_intent" RENAME COLUMN "intent" TO "summary";--> statement-breakpoint
ALTER TABLE "findings" ADD COLUMN "in_scope" boolean;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "confidence" double precision;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "sources" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "plan_link_url" text;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "plan_link_status" text DEFAULT 'not_linked' NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "computed_for_sha" text;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD COLUMN "computed_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "pr_intent" ADD CONSTRAINT "pr_intent_confidence_ck" CHECK ("pr_intent"."confidence" is null or ("pr_intent"."confidence" between 0 and 1));--> statement-breakpoint
ALTER TABLE "pr_intent" ADD CONSTRAINT "pr_intent_plan_link_status_ck" CHECK ("pr_intent"."plan_link_status" in ('not_linked', 'fetched', 'inaccessible'));