require("dotenv").config();

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function main() {
  try {
    const result = await pool.query(`
      SELECT
        table_name,
        column_name,
        data_type
      FROM information_schema.columns
      WHERE table_name IN (
        'orders',
        'payments',
        'incidents',
        'webhook_events',
        'recovery_actions'
      )
      ORDER BY
        table_name,
        ordinal_position;
    `);

    console.table(result.rows);

    console.log("\n===== WORKSPACE COLUMN CHECK =====");

    const workspaceTables = [
      "orders",
      "payments",
      "incidents",
      "webhook_events",
      "recovery_actions",
    ];

    for (const table of workspaceTables) {
      const check = await pool.query(
        `
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = $1
            AND column_name = 'workspace_id'
        ) AS exists;
        `,
        [table]
      );

      console.log(
        `${table.padEnd(20)} workspace_id: ${
          check.rows[0].exists ? "YES" : "NO"
        }`
      );
    }

    console.log("\nDatabase column verification completed.");
  } catch (error) {
    console.error("\nDATABASE CHECK FAILED:");
    console.error(error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();