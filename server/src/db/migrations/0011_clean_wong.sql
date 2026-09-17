-- Defensive normalization before adding real FKs below: reviews.agent_id /
-- reviews.run_id were bare uuid columns with no reference, so a row created
-- while an agent/run was already deleted (or any other drift) would fail the
-- new constraint. Verified no orphans exist against the current dev DB
-- (2026-09-17), but this keeps the migration safe to run against any
-- environment where that isn't true.
UPDATE "reviews" SET "agent_id" = NULL WHERE "agent_id" IS NOT NULL AND "agent_id" NOT IN (SELECT "id" FROM "agents");--> statement-breakpoint
UPDATE "reviews" SET "run_id" = NULL WHERE "run_id" IS NOT NULL AND "run_id" NOT IN (SELECT "id" FROM "agent_runs");--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "findings_review_idx" ON "findings" USING btree ("review_id");--> statement-breakpoint
CREATE INDEX "reviews_pr_idx" ON "reviews" USING btree ("pr_id");--> statement-breakpoint
CREATE INDEX "reviews_ws_idx" ON "reviews" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "reviews_run_idx" ON "reviews" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "agent_runs_pr_idx" ON "agent_runs" USING btree ("pr_id");--> statement-breakpoint
CREATE INDEX "agent_runs_agent_idx" ON "agent_runs" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_runs_ws_idx" ON "agent_runs" USING btree ("workspace_id");--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_severity_ck" CHECK ("findings"."severity" in ('CRITICAL', 'WARNING', 'SUGGESTION'));--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_category_ck" CHECK ("findings"."category" in ('bug', 'security', 'perf', 'style', 'test'));--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_kind_ck" CHECK ("findings"."kind" in ('finding', 'secret_leak', 'lethal_trifecta', 'phantom', 'hook'));--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_kind_ck" CHECK ("reviews"."kind" in ('summary', 'review'));--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_verdict_ck" CHECK ("reviews"."verdict" in ('request_changes', 'approve', 'comment'));--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_status_ck" CHECK ("agent_runs"."status" in ('running', 'done', 'failed', 'cancelled'));