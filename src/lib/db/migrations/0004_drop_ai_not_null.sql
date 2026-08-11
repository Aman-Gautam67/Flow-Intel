ALTER TYPE "public"."platform" ADD VALUE 'AIRFLOW' BEFORE 'NODE_RED';--> statement-breakpoint
ALTER TYPE "public"."platform" ADD VALUE 'PREFECT' BEFORE 'NODE_RED';--> statement-breakpoint
ALTER TYPE "public"."platform" ADD VALUE 'DAGSTER' BEFORE 'NODE_RED';--> statement-breakpoint
ALTER TYPE "public"."platform" ADD VALUE 'GENERIC' BEFORE 'NODE_RED';ALTER TABLE "workflow_scores" ALTER COLUMN "ai_guardrails_score" DROP NOT NULL;ALTER TABLE "workflow_scores" ALTER COLUMN "ai_guardrails_score" DROP DEFAULT;
