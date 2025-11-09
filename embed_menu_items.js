import 'dotenv/config';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supa   = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Skip if no key (so your pipeline still runs)
if (!process.env.OPENAI_API_KEY?.startsWith('sk-')) {
  console.log('No valid OPENAI_API_KEY set. Skipping embedding.');
  process.exit(0);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function withRetries(fn, label) {
  let delay = 1000;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try { return await fn(); }
    catch (err) {
      const code = err?.status || err?.code;
      if (code === 401 || err?.code === 'insufficient_quota') throw err; // hard stop
      const ra = Number(err?.headers?.['retry-after']) || null;
      const wait = ra ? ra * 1000 : delay;
      console.log(`[${label}] attempt ${attempt} failed (${code||''}): ${err?.message||err}`);
      console.log(`[${label}] waiting ${Math.round(wait/1000)}s…`);
      await sleep(wait);
      delay = Math.min(delay * 2, 30000);
    }
  }
  throw new Error(`[${label}] ran out of retries`);
}

async function main() {
  // keep cost low: only embed today..+6 days (adjust if you want)
  const today = new Date();
  const end = new Date(today.getTime() + 6*86400000);
  const d0 = today.toISOString().slice(0,10);
  const d1 = end.toISOString().slice(0,10);

  const PAGE = 400;  // DB rows per run
  const CHUNK = 64;  // texts per embeddings request

  const { data: rows, error } = await supa
    .from('menu_items')
    .select('id,name')
    .is('name_embedding', null)
    .gte('date', d0)
    .lte('date', d1)
    .limit(PAGE);

  if (error) throw error;
  if (!rows?.length) return console.log('No rows to embed.');

  console.log(`Found ${rows.length} rows needing embeddings (${d0}..${d1}).`);

  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const texts = slice.map(r => (r.name || '').trim());
    const nonEmpty = texts.map((t, idx) => ({ t, idx })).filter(x => x.t.length > 0);
    if (!nonEmpty.length) continue;

    const vectors = await withRetries(async () => {
      const res = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: nonEmpty.map(x => x.t)
      });
      return res.data.map(d => d.embedding);
    }, 'embeddings');

    const updates = [];
    let j = 0;
    for (const { idx } of nonEmpty) {
      updates.push({ id: slice[idx].id, name_embedding: vectors[j++] });
    }

    await withRetries(
      async () => await supa.from('menu_items').upsert(updates, { onConflict: 'id' }),
      'upsert'
    );

    console.log(`Embedded ${updates.length} / ${rows.length} (this run)`);
    await sleep(300);
  }

  console.log('Done with this page. Re-run to continue later.');
}

main().catch(err => {
  console.error(err);
  if (String(err?.code || err?.message).includes('insufficient_quota')) {
    console.log('Hit quota. Add credits or wait for reset.'); // 429 quota info :contentReference[oaicite:4]{index=4}
  }
  process.exit(1);
});

