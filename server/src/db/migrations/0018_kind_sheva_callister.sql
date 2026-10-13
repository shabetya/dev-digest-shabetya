ALTER TABLE "ci_runs" ADD COLUMN "commit_sha" text;--> statement-breakpoint
ALTER TABLE "ci_runs" ADD COLUMN "github_run_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "ci_installations_agent_repo_uq" ON "ci_installations" USING btree ("agent_id","repo");--> statement-breakpoint
ALTER TABLE "ci_runs" ADD CONSTRAINT "ci_runs_installation_run_uq" UNIQUE NULLS NOT DISTINCT("ci_installation_id","github_run_id");