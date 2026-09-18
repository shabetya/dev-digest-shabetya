ALTER TABLE "conventions" ALTER COLUMN "category" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "conventions" ALTER COLUMN "evidence_path" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "conventions" ALTER COLUMN "evidence_line_start" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "conventions" ALTER COLUMN "evidence_line_end" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "conventions" ALTER COLUMN "status" SET DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "conventions" ALTER COLUMN "status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "conventions" DROP COLUMN "accepted";