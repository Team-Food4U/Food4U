import "dotenv/config";
import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const app = express();
app.use(cors());
app.use(express.json());

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing Supabase credentials in .env");
  process.exit(1);
}
const supa = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

const openaiKey = process.env.OPENAI_API_KEY;
const openai = openaiKey?.startsWith("sk-") ? new OpenAI({ apiKey: openaiKey }) : null;
const hasOpenAIKey = !!openai;

console.log("✅ Food4U backend connected");

// ---------- helper functions ----------
function parseCalories(nutrition) {
  if (!nutrition || typeof nutrition !== "object") return null;
  for (const [k, v] of Object.entries(nutrition)) {
    if (k.toLowerCase().includes("cal")) {
      const n = typeof v === "string" ? v.match(/\d+/)?.[0] : v;
      if (n) return Number(n);
    }
  }
  return null;
}

function fallbackCalories(name) {
  if (!name) return 200;
  const n = name.toLowerCase();
  if (n.includes("chicken")) return 250;
  if (n.includes("beef")) return 300;
  if (n.includes("pork")) return 280;
  if (n.includes("turkey")) return 230;
  if (n.includes("fish") || n.includes("salmon")) return 240;
  if (n.includes("tofu") || n.includes("veggie")) return 180;
  if (n.includes("salad")) return 120;
  if (n.includes("pasta") || n.includes("mac")) return 320;
  if (n.includes("soup")) return 150;
  return 200;
}

// ---------- routes ----------
app.get("/", (_req, res) => res.send("✅ Food4U backend running!"));

// 🔹 main recommendation endpoint
app.post("/ai/recommend", async (req, res) => {
  const prompt = (req.body?.prompt || "").trim();
  if (!prompt) return res.json({ mode: "no_prompt", results: [] });

  try {
    // 1️⃣ fetch menu items
    const { data: itemsRaw, error: itemErr } = await supa
      .from("menu_items_final")
      .select("*")
      .limit(100);
    if (itemErr) throw itemErr;

    // 2️⃣ fetch all locations once
    const { data: locs, error: locErr } = await supa
      .from("locations")
      .select("id,name");
    if (locErr) throw locErr;

    const locationMap = new Map(locs.map(l => [l.id, l.name]));

    // 3️⃣ normalize data
    const items = itemsRaw.map(r => {
      const location_name = locationMap.get(r.location_id) || "Unknown";
      const cal = parseCalories(r.nutrition) ?? fallbackCalories(r.name);
      return {
        id: r.id,
        name: r.name,
        meal: r.meal || "All Day",
        location_name,
        calories_kcal: cal,
        nutrition: r.nutrition || {},
      };
    });

    if (!items.length) return res.json({ mode: "no_results", results: [] });

    // 4️⃣ AI ranking
    let rankedIds = [];
    if (openai) {
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content:
                "Rank menu items by relevance to the user's query. Input: {query, items}. Output strictly JSON: {ranked_ids:[...]}.",
            },
            { role: "user", content: JSON.stringify({ query: prompt, items }) },
          ],
        });
        const content = completion.choices?.[0]?.message?.content || "";
        const parsed = JSON.parse(content.match(/\{[\s\S]*\}/)?.[0] || "{}");
        if (Array.isArray(parsed.ranked_ids)) rankedIds = parsed.ranked_ids;
      } catch (e) {
        console.warn("⚠️ OpenAI ranking failed:", e.message);
      }
    }

    const byId = new Map(items.map(it => [it.id, it]));
    const ranked = rankedIds.map(id => byId.get(id)).filter(Boolean);
    const results = ranked.length ? ranked : items.slice(0, 10);

    res.json({
      mode: openai ? "chatgpt_semantic" : "no_openai",
      hasOpenAIKey,
      results,
    });
  } catch (e) {
    console.error("🔥 /ai/recommend error:", e);
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => console.log(`🚀 Server ready at http://localhost:${PORT}`));
