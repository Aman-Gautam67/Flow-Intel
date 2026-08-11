import { db } from "./src/lib/db/client";
import { sql } from "drizzle-orm";
async function main() {
  const res = await db.execute(sql`SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'workflow_scores' AND column_name = 'ai_guardrails_score';`);
  console.log(res);
  process.exit(0);
}
main();
