import { readdir, readFile } from "node:fs/promises";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is required");
}

const sql = postgres(connectionString, {
  max: 1,
  connect_timeout: 20,
  idle_timeout: 5,
});

try {
  const migrationsDirectory = new URL("../db/migrations/", import.meta.url);
  const migrations = (await readdir(migrationsDirectory))
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort();
  for (const name of migrations) {
    const migration = await readFile(new URL(name, migrationsDirectory), "utf8");
    await sql.unsafe(migration);
    console.log(`Applied ${name}.`);
  }

  const expectedTables = [
    "obseri_conversations",
    "obseri_published_souls",
    "obseri_rate_limits",
    "obseri_webhook_deliveries",
    "obseri_user_workspaces",
    "obseri_billing_subscriptions",
    "obseri_billing_events",
    "obseri_usage_monthly",
    "obseri_usage_grants",
    "obseri_usage_reservations",
  ];
  const rows = await sql`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name = any(${expectedTables})
    order by table_name
  `;
  const createdTables = rows.map((row) => row.table_name);

  if (createdTables.length !== expectedTables.length) {
    throw new Error(
      `Migration verification failed: found ${createdTables.length}/${expectedTables.length} tables`,
    );
  }

  console.log(`Migration verified (${createdTables.length} tables).`);
  for (const table of createdTables) console.log(`- ${table}`);
} finally {
  await sql.end({ timeout: 5 });
}
