require("dotenv").config();

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("render.com")
    ? { rejectUnauthorized: false }
    : undefined,
});

async function main() {
  try {
    console.log("\n===== V4 DATABASE CHECK =====");

    const columns = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'incidents'
      AND column_name IN (
        'recovery_score',
        'recovery_probability',
        'recovery_confidence',
        'revenue_at_risk',
        'recommended_action',
        'recommendation_reason'
      )
      ORDER BY column_name
    `);

    console.log("\nIncident v4 columns:");
    console.table(columns.rows);

    const tables = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN (
        'automation_settings',
        'automation_runs'
      )
      ORDER BY table_name
    `);

    console.log("\nAutomation tables:");
    console.table(tables.rows);

    const settings = await pool.query(`
      SELECT *
      FROM automation_settings
      LIMIT 10
    `);

    console.log("\nAutomation settings:");
    console.table(settings.rows);

    console.log("\n===== V4 DATABASE CHECK COMPLETE =====");
  } catch (error) {
    console.error("\nDATABASE CHECK FAILED:");
    console.error(error);
  } finally {
    await pool.end();
  }
}

main();