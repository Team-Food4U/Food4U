// Food4U backend – ChatGPT-powered semantic search + nutrition-aware ranking
import "dotenv/config";
import express from "express";
import cors from "cors";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const app = express();

// --- CORS: allow everything in dev to avoid issues ---
app.use(cors());
app.use(express.json());

// --- Supabase server client (Service Role; backend only) ---
const supa = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// --- OpenAI client (for ChatGPT analysis + ranking) ---
const hasOpenAIKey =
  typeof process.env.OPENAI_API_KEY === "string" &&
  process.env.OPENAI_API_KEY.startsWith("sk-");

const openai = hasOpenAIKey
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

console.log(">>> Food4U backend: AI semantic index.js loaded <<<");
console.log("OpenAI key present:", hasOpenAIKey);

// --- Health check ---
app.get("/", (_req, res) => {
  res.send("Food4U AI API is running!");
});

// ---------- helpers ----------
function parseMealFromTime(timeStr) {
  if (!timeStr) return null;
  const [hh, mm] = timeStr.split(":").map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  const minutes = hh * 60 + mm;

  if (minutes < 10 * 60 + 30) return "Breakfast";
  if (minutes < 16 * 60) return "Lunch";
  if (minutes < 21 * 60) return "Dinner";
  return "Late Night";
}

function parseMealFromText(text) {
  if (!text) return null;
  const t = text.toLowerCase();
  if (t.includes("breakfast")) return "Breakfast";
  if (t.includes("lunch")) return "Lunch";
  if (t.includes("dinner")) return "Dinner";
  if (t.includes("late night")) return "Late Night";
  return null;
}

// pull first numeric value from a list of candidates (number or string containing a number)
function pickFirstNumber(...candidates) {
  for (const val of candidates) {
    if (val === null || val === undefined) continue;
    if (typeof val === "number" && Number.isFinite(val)) return val;
    if (typeof val === "string") {
      const m = val.match(/-?\d+(\.\d+)?/);
      if (m) {
        const n = Number(m[0]);
        if (Number.isFinite(n)) return n;
      }
    }
  }
  return null;
}

// choose first non-empty string
function pickFirstString(...candidates) {
  for (const val of candidates) {
    if (typeof val === "string" && val.trim().length > 0) {
      return val.trim();
    }
  }
  return null;
}

// Normalize calories + serving from a DB row
function normalizeRow(row) {
  const nutrition = row?.nutrition || {};

  const calories_kcal = pickFirstNumber(
    row.calories_kcal,
    row.calories,
    row.kcal,
    nutrition.calories_kcal,
    nutrition.calories,
    nutrition.kcal,
    nutrition.kcals,
    nutrition.Calories,
    nutrition.calories_per_serving
  );

  const serving_label =
    pickFirstString(
      row.serving_label,
      row.serving_size,
      row.portion_size,
      row.portion,
      nutrition.serving_label,
      nutrition.serving_size,
      nutrition.serving_size_oz,
      nutrition.serving_unit,
      nutrition.ServingSize
    ) || "1 serving";

  return {
    ...row,
    calories_kcal,
    serving_label,
  };
}

/**
 * POST /ai/recommend
 *  - Fetches candidate menu items from Supabase
 *  - Filters by date/DC/meal depending on dropdown selection
 *  - Sends user query + candidates + nutrition to ChatGPT
 *  - ChatGPT picks & ranks the best 10
 *  - NO mock/fallback rows. On errors, returns { mode: "...", error: "..." }
 */
app.post("/ai/recommend", async (req, res) => {
  const prompt = String(req.body?.prompt || req.body?.query || "").trim();
  const date = req.body?.date || new Date().toISOString().slice(0, 10);
  const time = req.body?.time || null;
  const dcSelection = req.body?.dc || "All DCs"; // e.g. "All DCs", "Worcester", "Other (Paid)"

  const DC_NAMES = ["Worcester", "Franklin", "Hampshire", "Berkshire"];

  // Interpret dropdown (we trust the UI; no regex magic on prompt anymore)
  let modePaid = null; // 'dc', 'retail', or null
  let specificDcLabel = null;

  if (dcSelection === "All DCs") {
    modePaid = "dc"; // all dining commons (not paid)
  } else if (dcSelection === "Other (Paid)") {
    modePaid = "retail"; // paid locations (Blue Wall etc.)
  } else if (DC_NAMES.includes(dcSelection)) {
    modePaid = "dc";
    specificDcLabel = dcSelection;
  } else {
    // Unknown selection → treat as "All DCs"
    modePaid = "dc";
  }

  const mealFromTime = parseMealFromTime(time);
  const mealFromText = parseMealFromText(prompt);
  const meal = mealFromText || mealFromTime || null;

  // nutrition intent flags (used in system prompt only)
  const wantsLowCal =
    /low[-\s]?cal(orie)?|light|diet/i.test(prompt) ||
    /under\s*\d{2,4}\s*cal/i.test(prompt);
  const wantsHighCal =
    /high[-\s]?cal(orie)?|bulking|gain weight|mass gainer/i.test(prompt);
  const wantsHighProtein = /high[-\s]?protein|protein\s*heavy/i.test(prompt);
  const wantsLowSodium = /low[-\s]?sodium|low[-\s]?salt/i.test(prompt);

  if (!hasOpenAIKey || !openai) {
    return res.json({
      mode: "ai_unavailable",
      hasOpenAIKey: false,
      date,
      results: [],
      error: "OpenAI API key missing or invalid; cannot run AI analysis.",
    });
  }

  try {
    // STEP 1: fetch candidates from Supabase
    let q = supa.from("v_menu_items").select("*");

    if (modePaid === "retail") {
      // Paid: show retail menus, regardless of date (often static)
      q = q.eq("is_paid", true);
    } else if (modePaid === "dc") {
      // Dining commons: use date and is_paid=false
      q = q.eq("date", date).eq("is_paid", false);
    } else {
      // Fallback (shouldn't really happen): just use date
      q = q.eq("date", date);
    }

    if (meal) {
      q = q.eq("meal", meal);
    }

    const { data, error } = await q.limit(200);

    if (error) {
      console.error("[ai/recommend] Supabase error:", error);
      return res.json({
        mode: "db_error",
        hasOpenAIKey,
        date,
        results: [],
        error: "Supabase query failed: " + String(error.message || error),
      });
    }

    if (!data || data.length === 0) {
      return res.json({
        mode: "no_results",
        hasOpenAIKey,
        date,
        results: [],
      });
    }

    // Normalize rows and remove obvious test/sample rows
    let normalized = data
      .map(normalizeRow)
      .filter(
        (it) =>
          !/^sample\b/i.test(it.name || "") && !/^test\b/i.test(it.name || "")
      );

    // Extra safety: if modePaid is 'dc', filter to non-paid in JS as well
    if (modePaid === "dc") {
      normalized = normalized.filter((it) => !it.is_paid);
    } else if (modePaid === "retail") {
      normalized = normalized.filter((it) => !!it.is_paid);
    }

    // Apply DC-specific filter by substring on location_name (more forgiving)
    if (specificDcLabel) {
      const needle = specificDcLabel.toLowerCase();
      normalized = normalized.filter((it) => {
        const loc = (it.location_name || "").toLowerCase();
        return loc.includes(needle);
      });
    }

    if (normalized.length === 0) {
      return res.json({
        mode: "no_results",
        hasOpenAIKey,
        date,
        results: [],
      });
    }

    // STEP 2: ChatGPT ranking
    const systemMessage =
      "You are a helpful assistant that recommends UMass menu items based on a user query. " +
      "You receive a JSON object containing the user query, filters, and a list of candidate menu items. " +
      "You must pick and rank the most relevant 10 items. " +
      "Consider BOTH semantic similarity (e.g., dumplings ≈ potstickers) and nutrition preferences such as " +
      '"low calorie", "high protein", "low sodium", etc., based on the provided nutrition fields. ' +
      'If the user explicitly says "no X", avoid items containing X. ' +
      'Respond with ONLY valid JSON of the form {"ranked_ids":[...]} where ranked_ids is an array of item ids. ' +
      "Do not include any explanation text.";

    const chatInput = {
      query: prompt,
      date,
      time,
      filters: {
        dcSelection,
        modePaid,
        meal,
        wantsLowCal,
        wantsHighCal,
        wantsHighProtein,
        wantsLowSodium,
      },
      items: normalized.map((it) => ({
        id: it.id,
        name: it.name,
        location_name: it.location_name,
        meal: it.meal,
        calories_kcal: it.calories_kcal,
        protein_g:
          it.nutrition && it.nutrition.protein_g != null
            ? Number(it.nutrition.protein_g)
            : null,
        sodium_mg:
          it.nutrition && it.nutrition.sodium_mg != null
            ? Number(it.nutrition.sodium_mg)
            : null,
        tags: it.tags || [],
      })),
    };

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: JSON.stringify(chatInput) },
      ],
      temperature: 0.2,
    });

    const content = completion.choices?.[0]?.message?.content || "";
    let rankedIds = [];
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed.ranked_ids)) {
        rankedIds = parsed.ranked_ids;
      }
    } catch (e) {
      console.warn("[ai/recommend] failed to parse ChatGPT JSON:", e);
    }

    const byId = new Map(normalized.map((it) => [it.id, it]));
    let ranked = [];
    for (const id of rankedIds) {
      const row = byId.get(id);
      if (row) ranked.push(row);
    }

    if (ranked.length === 0) {
      return res.json({
        mode: "ai_error",
        hasOpenAIKey: true,
        date,
        results: [],
        error: "ChatGPT did not return a valid ranking.",
      });
    }

    return res.json({
      mode: "chatgpt_semantic",
      hasOpenAIKey: true,
      date,
      results: ranked.slice(0, 10),
    });
  } catch (e) {
    console.error("[ai/recommend] fatal:", e);
    return res.json({
      mode: "ai_error",
      hasOpenAIKey,
      date,
      results: [],
      error: String(e),
    });
  }
});

// --- Optional debug /search endpoint (not used by UI) ---
app.post("/search", async (req, res) => {
  try {
    const {
      query = "",
      date = new Date().toISOString().slice(0, 10),
      is_paid = null,
      meal = null,
      page = 1,
      page_size = 50,
    } = req.body || {};

    const from = (page - 1) * page_size;
    const to = from + page_size - 1;

    let q = supa
      .from("v_menu_items")
      .select("*", { count: "exact" })
      .eq("date", date);

    if (is_paid !== null) q = q.eq("is_paid", is_paid);
    if (meal) q = q.eq("meal", meal);
    if (query.trim()) {
      q = q.textSearch("search_tsv", query, { type: "websearch" });
    }

    const { data, error, count } = await q
      .order("name", { ascending: true })
      .range(from, to);

    if (error) {
      console.error("[search] supabase error", error);
      return res.json({ error: String(error.message || error) });
    }

    const normalized = (data || []).map(normalizeRow);

    res.json({
      date,
      total: count ?? normalized.length,
      page,
      page_size,
      results: normalized,
    });
  } catch (e) {
    console.error("[search] fatal", e);
    res.json({ error: String(e) });
  }
});

// --- start server ---
const PORT = process.env.PORT || 8787;
app.listen(PORT, () => {
  console.log(`AI API running on http://localhost:${PORT}`);
});
