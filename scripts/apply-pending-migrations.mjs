import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import pg from "pg";

const projectRoot = resolve(import.meta.dirname, "..");
const migrationsDir = resolve(projectRoot, "supabase/migrations");
const pendingMigrationNames = [
  "0011_publish_readiness_gate.sql",
  "0012_stale_dispatch_recovery.sql",
  "0013_publish_public_id_gen_random_bytes_repair.sql"
];

const databaseUrl = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(
    "Set SUPABASE_DB_URL or DATABASE_URL (Supabase → Project Settings → Database → Connection string)."
  );
  process.exit(1);
}

const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });

await client.connect();

try {
  await client.query(`
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (
      version text primary key,
      statements text[],
      name text
    );
  `);

  const applied = await client.query("select version from supabase_migrations.schema_migrations");
  const appliedVersions = new Set(applied.rows.map((row) => row.version));

  for (const migrationName of pendingMigrationNames) {
    const version = migrationName.replace(/_.+$/, "");
    if (appliedVersions.has(version)) {
      console.log(`skip ${migrationName} (already applied)`);
      continue;
    }

    const sql = await readFile(resolve(migrationsDir, migrationName), "utf8");
    console.log(`apply ${migrationName}`);
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query(
        "insert into supabase_migrations.schema_migrations(version, statements, name) values ($1, $2, $3)",
        [version, [sql], migrationName]
      );
      await client.query("commit");
      console.log(`ok ${migrationName}`);
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }

  const allMigrations = (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort();
  const stillPending = allMigrations.filter(
    (name) => !appliedVersions.has(name.replace(/_.+$/, "")) && !pendingMigrationNames.includes(name)
  );
  if (stillPending.length > 0) {
    console.log("Other local migrations not checked by this script:", stillPending.join(", "));
  }
} finally {
  await client.end();
}
