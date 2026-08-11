import { db } from "@/lib/db/client";
import { sql } from "drizzle-orm";

async function run() {
  try {
    console.log("Adding enum values...");
    await db.execute(sql`ALTER TYPE "public"."platform" ADD VALUE IF NOT EXISTS 'AIRFLOW'`);
    await db.execute(sql`ALTER TYPE "public"."platform" ADD VALUE IF NOT EXISTS 'PREFECT'`);
    await db.execute(sql`ALTER TYPE "public"."platform" ADD VALUE IF NOT EXISTS 'DAGSTER'`);
    await db.execute(sql`ALTER TYPE "public"."platform" ADD VALUE IF NOT EXISTS 'GENERIC'`);
    await db.execute(sql`ALTER TYPE "public"."platform" ADD VALUE IF NOT EXISTS 'NODE_RED'`);
    await db.execute(sql`ALTER TYPE "public"."platform" ADD VALUE IF NOT EXISTS 'ACTIVEPIECES'`);
    
    console.log("Patching ai_guardrails_score...");
    await db.execute(sql`ALTER TABLE "workflow_scores" ALTER COLUMN "ai_guardrails_score" DROP NOT NULL`);
    await db.execute(sql`ALTER TABLE "workflow_scores" ALTER COLUMN "ai_guardrails_score" DROP DEFAULT`);
    console.log("Done!");
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}
run();
