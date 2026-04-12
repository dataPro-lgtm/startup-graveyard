/**
 * Generate embeddings for all published cases without embeddings.
 * Run from services/api: node scripts/gen_embeddings.mjs
 */
import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load .env from project root
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '../../../.env');
try {
  const envContent = readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  /* ignore */
}

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5433/sg';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com').replace(
  /\/$/,
  '',
);

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
    body: JSON.stringify({ model: 'text-embedding-ada-002', input: text }),
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
    SELECT c.id, c.slug, c.company_name, c.summary, c.industry_key,
           c.search_tags, c.key_lessons,
           (ce.case_id IS NOT NULL) as has_embed
    FROM cases c
    LEFT JOIN case_embeddings ce ON ce.case_id = c.id
    WHERE c.status = 'published'
    ORDER BY c.created_at
  `);

  const toProcess = rows.filter((r) => !r.has_embed);
  console.log(`Total published: ${rows.length}, need embedding: ${toProcess.length}`);

  for (const row of toProcess) {
    const text = [
      `公司：${row.company_name}`,
      `行业：${row.industry_key}`,
      `摘要：${row.summary}`,
      row.search_tags ? `标签：${row.search_tags}` : '',
      row.key_lessons ? `教训：${row.key_lessons.slice(0, 400)}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const embedding = await embedText(text);
      await pool.query(
        `
        INSERT INTO case_embeddings (case_id, embedding, updated_at)
        VALUES ($1, $2::vector, now())
        ON CONFLICT (case_id) DO UPDATE SET embedding = $2::vector, updated_at = now()
      `,
        [row.id, JSON.stringify(embedding)],
      );
      console.log(`✓ ${row.slug}`);
    } catch (e) {
      console.error(`✗ ${row.slug}:`, e.message);
    }

    await new Promise((r) => setTimeout(r, 350));
  }

  await pool.end();
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
