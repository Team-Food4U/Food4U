import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const app = express();
app.use(express.json());

const ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174'
];
app.use(
  cors({
    origin: (origin, cb) =>
      !origin || ORIGINS.includes(origin)
        ? cb(null, true)
        : cb(new Error('Not allowed by CORS')),
  })
);

const supa = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- Health check ---
app.get('/', (_req, res) => res.send('✅ UMass AI API is running!'));

// --- AI Recommendation Endpoint ---
app.post('/ai/recommend', async (req, res) => {
  console.log('🧠 Received AI recommend request:', req.body);
  const prompt = String(req.body?.query || req.body?.prompt || '').trim();
  const date = req.body?.date || new Date().toISOString().slice(0, 10);

  if (!prompt) {
    return res.status(400).json({ error: 'Missing prompt text' });
  }

  try {
    // 1️⃣ Create embedding for user query
    const emb = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: prompt,
    });
    const embedding = emb.data[0].embedding;

    // 2️⃣ Query Supabase vector search
    const { data, error } = await supa.rpc('match_menu_items', {
      query_embedding: embedding,
      match_threshold: 0.5,
      match_count: 6,
      target_date: date,
    });
    if (error) throw error;

    // 3️⃣ Use GPT to summarize and recommend
    const menuList = data.map((d) => d.name).join(', ') || 'No menu items found.';
    const chat = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are a UMass Dining recommendation assistant. Recommend items from the list that best match the user request.',
        },
        {
          role: 'user',
          content: `User request: "${prompt}". Today's menu includes: ${menuList}. Suggest 2–3 best items and explain briefly why.`,
        },
      ],
    });

    const aiResponse = chat.choices[0].message.content;

    res.json({
      date,
      query:
