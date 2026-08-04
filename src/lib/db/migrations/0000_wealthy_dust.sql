CREATE TYPE "public"."platform" AS ENUM('N8N', 'MAKE', 'ZAPIER', 'FLOWISE', 'LANGFLOW');--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"email" varchar(256),
	"name" text,
	"avatar_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"slug" varchar(128) NOT NULL,
	CONSTRAINT "categories_name_unique" UNIQUE("name"),
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "dependencies" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"workflow_id" varchar(128) NOT NULL,
	"service_name" varchar(256) NOT NULL,
	"category" varchar(128) NOT NULL,
	"is_ai" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	CONSTRAINT "tags_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "workflow_categories" (
	"workflow_id" varchar(128) NOT NULL,
	"category_id" varchar(128) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_scores" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"version_id" varchar(128) NOT NULL,
	"health_score" integer DEFAULT 100 NOT NULL,
	"security_score" integer DEFAULT 100 NOT NULL,
	"complexity_score" integer DEFAULT 0 NOT NULL,
	"reliability_score" integer DEFAULT 100 NOT NULL,
	"debt_score" integer DEFAULT 100 NOT NULL,
	"memory_score" integer DEFAULT 100 NOT NULL,
	"resilience_score" integer DEFAULT 100 NOT NULL,
	"privacy_score" integer DEFAULT 100 NOT NULL,
	"ai_guardrails_score" integer DEFAULT 100 NOT NULL,
	"estimated_cost_usd" double precision DEFAULT 0 NOT NULL,
	"security_flags" json DEFAULT '[]'::json NOT NULL,
	"resilience_flags" json DEFAULT '[]'::json NOT NULL,
	"memory_profile" json DEFAULT '{}'::json NOT NULL,
	"debt_profile" json DEFAULT '{}'::json NOT NULL,
	"privacy_profile" json DEFAULT '{}'::json NOT NULL,
	"remediation_steps" json DEFAULT '[]'::json NOT NULL,
	"all_flags" json DEFAULT '[]'::json NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_scores_version_id_unique" UNIQUE("version_id")
);
--> statement-breakpoint
CREATE TABLE "workflow_tags" (
	"workflow_id" varchar(128) NOT NULL,
	"tag_id" varchar(128) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_versions" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"workflow_id" varchar(128) NOT NULL,
	"version_num" integer DEFAULT 1 NOT NULL,
	"raw_json" json NOT NULL,
	"node_count" integer DEFAULT 0 NOT NULL,
	"trigger_type" varchar(256),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"slug" varchar(256) NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"platform" "platform" DEFAULT 'N8N' NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"author_id" varchar(128),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workflows_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "dependencies" ADD CONSTRAINT "dependencies_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_categories" ADD CONSTRAINT "workflow_categories_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_categories" ADD CONSTRAINT "workflow_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_scores" ADD CONSTRAINT "workflow_scores_version_id_workflow_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."workflow_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_tags" ADD CONSTRAINT "workflow_tags_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_tags" ADD CONSTRAINT "workflow_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "dep_workflow_idx" ON "dependencies" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "dep_service_idx" ON "dependencies" USING btree ("service_name");--> statement-breakpoint
CREATE UNIQUE INDEX "wc_pk" ON "workflow_categories" USING btree ("workflow_id","category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ws_version_idx" ON "workflow_scores" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "ws_security_idx" ON "workflow_scores" USING btree ("security_score");--> statement-breakpoint
CREATE INDEX "ws_health_idx" ON "workflow_scores" USING btree ("health_score");--> statement-breakpoint
CREATE UNIQUE INDEX "wt_pk" ON "workflow_tags" USING btree ("workflow_id","tag_id");--> statement-breakpoint
CREATE INDEX "wv_workflow_idx" ON "workflow_versions" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "wv_version_idx" ON "workflow_versions" USING btree ("workflow_id","version_num");--> statement-breakpoint
CREATE UNIQUE INDEX "workflows_slug_idx" ON "workflows" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "workflows_author_idx" ON "workflows" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "workflows_public_idx" ON "workflows" USING btree ("is_public");--> statement-breakpoint
CREATE INDEX "workflows_platform_idx" ON "workflows" USING btree ("platform");