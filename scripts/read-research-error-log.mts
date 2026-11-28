import { Pool } from "pg";

const usage = "Usage: tsx scripts/read-research-error-log.mts FROM_UTC TO_UTC (ISO UTC timestamps, end exclusive)";
const isoUtc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;

function utc(value: string | undefined): Date | undefined {
  if (value === undefined || !isoUtc.test(value)) return undefined;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return undefined;
  const normalized = value.length === 20 ? value.replace("Z", ".000Z") : value;
  return parsed.toISOString() === normalized ? parsed : undefined;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const [from, to] = argv.map(utc);
  if (argv.length !== 2 || from === undefined || to === undefined || from >= to) {
    throw new Error(usage);
  }
  const connectionString = process.env.ASKRIGOR_ERROR_LOG_READER_DATABASE_URL;
  const schema = process.env.ASKRIGOR_ERROR_LOG_SCHEMA ?? "living_evidence";
  if (!connectionString || !/^[a-z][a-z0-9_]{0,62}$/u.test(schema)) {
    throw new Error("Configure the maintainer's error-log reader connection and schema.");
  }
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 5_000, statement_timeout: 30_000 });
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await client.query("SET LOCAL TIME ZONE 'UTC'");
      const window = `FROM ${schema}.research_error_log
        WHERE received_at >= $1 AND received_at < $2 AND received_at > transaction_timestamp() - interval '720 hours'`;
      const counts = await client.query(`SELECT (received_at AT TIME ZONE 'UTC')::date::text AS day,
        tool, kind, source, app, outcome, count(*) AS calls
        ${window}
        GROUP BY 1, tool, kind, source, app, outcome
        ORDER BY 1, tool, kind, source, app, outcome`, [from, to]);
      const entries = await client.query(`SELECT received_at, duration_ms, tool, outcome, app,
        paper_identifiers, kind, source, http_status_class, shape, search_words
        ${window} ORDER BY received_at, tool`, [from, to]);
      await client.query("COMMIT");
      console.log(JSON.stringify({ counts: counts.rows, entries: entries.rows }, null, 2));
    } finally {
      client.release();
    }
  } catch {
    throw new Error("Could not read the error log. Check the maintainer's database access and the requested window.");
  } finally {
    await pool.end();
  }
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
