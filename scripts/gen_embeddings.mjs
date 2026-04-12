/**
 * Generate OpenAI text-embedding-ada-002 embeddings for all published cases
 * and upsert into case_embeddings table.
 *
 * Usage: node scripts/gen_embeddings.mjs
 */
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5433/sg';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com').replace(/\/$/, '');

if (!OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY not set');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function embedText(text) {
  const resp = await fetch(`${OPENAI_BASE_URL}/v1/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-ada-002',
      input: text,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Embedding API ${resp.status}: ${err.slice(0, 200)}`);
  }
  const data = await resp.json();
  return data.data[0].embedding;
}

async function main() {
  const { rows } = await pool.query(`
    SELECT c.id, c.slug, c.company_name, c.summary, c.industry_key, c.search_tags, c.key_lessons
    FROM cases c
    WHERE c.status = 'published'
    ORDER BY c.created_at
  `);

  console.log(`Found ${rows.length} published cases`);

  for (const row of rows) {
    const text = [
      `公司：${row.company_name}`,
      `行业：${row.industry_key}`,
      `摘要：${row.summary}`,
      row.search_tags ? `标签：${row.search_tags}` : '',
      row.key_lessons ? `教训：${row.key_lessons.slice(0, 400)}` : '',
    ].filter(Boolean).join('\n');

    try {
      const embedding = await embedText(text);
      await pool.query(`
        INSERT INTO case_embeddings (case_id, embedding, updated_at)
        VALUES ($1, $2, now())
        ON CONFLICT (case_id) DO UPDATE SET embedding = $2, updated_at = now()
      `, [row.id, JSON.stringify(embedding)]);
      console.log(`✓ ${row.slug}`);
    } catch (e) {
      console.error(`✗ ${row.slug}:`, e.message);
    }

    // Rate limit: 3 req/s
    await new Promise(r => setTimeout(r, 350));
  }

  await pool.end();
  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
