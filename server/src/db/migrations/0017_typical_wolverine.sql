CREATE TABLE "eval_suite_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"agent_version" integer NOT NULL,
	"config_snapshot" jsonb NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"reason" text,
	"recall" double precision,
	"precision" double precision,
	"citation_accuracy" double precision,
	"cases_passed" integer DEFAULT 0 NOT NULL,
	"cases_total" integer DEFAULT 0 NOT NULL,
	"cost_usd" double precision,
	"duration_ms" integer,
	"ran_at" timestamp with time zone DEFAULT now() NOT NULL,
	"error" text,
	CONSTRAINT "eval_suite_runs_status_ck" CHECK ("eval_suite_runs"."status" in ('running', 'completed', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "expectation" text DEFAULT 'must_find' NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "source_finding_id" uuid;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "suite_run_id" uuid;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "status" text;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "eval_suite_runs" ADD CONSTRAINT "eval_suite_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_suite_runs" ADD CONSTRAINT "eval_suite_runs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eval_suite_runs_agent_ran_idx" ON "eval_suite_runs" USING btree ("agent_id","ran_at");--> statement-breakpoint
CREATE INDEX "eval_suite_runs_ws_idx" ON "eval_suite_runs" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "eval_suite_runs_one_running_uq" ON "eval_suite_runs" USING btree ("agent_id") WHERE "eval_suite_runs"."status" = 'running';--> statement-breakpoint
ALTER TABLE "eval_cases" ADD CONSTRAINT "eval_cases_source_finding_id_findings_id_fk" FOREIGN KEY ("source_finding_id") REFERENCES "public"."findings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_suite_run_id_eval_suite_runs_id_fk" FOREIGN KEY ("suite_run_id") REFERENCES "public"."eval_suite_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eval_cases_owner_idx" ON "eval_cases" USING btree ("owner_kind","owner_id");--> statement-breakpoint
CREATE INDEX "eval_cases_ws_idx" ON "eval_cases" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "eval_cases_source_finding_uq" ON "eval_cases" USING btree ("source_finding_id");--> statement-breakpoint
CREATE INDEX "eval_runs_suite_idx" ON "eval_runs" USING btree ("suite_run_id");--> statement-breakpoint
CREATE INDEX "eval_runs_case_idx" ON "eval_runs" USING btree ("case_id","ran_at");--> statement-breakpoint
ALTER TABLE "eval_cases" ADD CONSTRAINT "eval_cases_expectation_ck" CHECK ("eval_cases"."expectation" in ('must_find', 'must_not_flag'));--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_status_ck" CHECK ("eval_runs"."status" is null or "eval_runs"."status" in ('passed', 'failed', 'error'));