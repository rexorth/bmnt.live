import "dotenv/config";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "./index";

async function main() {
  const db = createDb();
  await migrate(db, { migrationsFolder: "./drizzle" });
  await db.$client.end();
  console.log("migrations applied");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
