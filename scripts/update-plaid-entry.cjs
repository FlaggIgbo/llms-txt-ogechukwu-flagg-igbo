const { Pool } = require('pg');

const localConnectionString = 'postgresql://postgres:postgres@localhost:5432/llmstxt_directory?schema=public';
const prodConnectionString = 'postgresql://llmstxt_directory_user:KcGjKGvYBYHCRnAC2NT4qWYevfg9XATg@dpg-dbto6odckfvc7390hj6g-a.oregon-postgres.render.com/llmstxt_directory';

const updateSql = `
  UPDATE site_entries
  SET llms_txt_storage = 'https://plaid.com/docs/llms.txt',
      llms_full_txt_storage = 'https://plaid.com/docs/llms-full.txt',
      updated_at = NOW()
  WHERE website_url = 'https://plaid.com/docs'
     OR website_url = 'https://plaid.com/docs/'
     OR website_name ILIKE '%plaid%'
     OR llms_txt_storage ILIKE '%plaid.com_docs%'
  RETURNING id, website_name, website_url, llms_txt_storage, llms_full_txt_storage, updated_at;
`;

async function updateDb(name, connStr, isRemote) {
  console.log(`Connecting to ${name}...`);
  const pool = new Pool({
    connectionString: connStr,
    ssl: isRemote ? { rejectUnauthorized: false } : undefined,
  });

  try {
    const res = await pool.query(updateSql);
    console.log(`[${name}] Updated ${res.rows.length} row(s):`, JSON.stringify(res.rows, null, 2));
  } finally {
    await pool.end();
  }
}

async function main() {
  await updateDb('Local DB', localConnectionString, false);
  await updateDb('Prod DB', prodConnectionString, true);
}

main().catch(console.error);
