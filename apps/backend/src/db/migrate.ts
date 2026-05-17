import { createDb } from "./client.js";
import { applyDdl } from "./ddl.js";
import { env } from "../env.js";

async function main() {
  const db = createDb({ filename: env.dbPath });
  applyDdl(db.$client);
  // eslint-disable-next-line no-console
  console.log(`[db:migrate] applied DDL to ${env.dbPath}`);
  db.$client.close();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
