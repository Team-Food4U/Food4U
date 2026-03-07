<div align="center">
  <img src="food4u.png" alt="Food4U logo" width="110" />
  <h1>Food4U</h1>
  <p><strong>Chat-style AI meal recommendations built with React, Express, Supabase, and OpenAI.</strong></p>
  <p>
    AI-powered UMass dining options. Just 4 U.
  </p>
</div>

## Why Food4U

Campus dining sites are usually organized around static menu pages, not around how people actually search for food.
A student is more likely to think:

- “I want something high protein”
- “What can I get that feels light right now?”
- “What should I eat if I want chicken and not something heavy?”

Food4U reframes the problem as a retrieval + ranking workflow:

- ingest menu data from dining sources
- normalize it into a structured backend store
- accept a natural-language query from the user
- rank likely matches and return them in a simple chat-style UI

This project was built to show end-to-end SWE ownership across frontend product design, backend API development, third-party data ingestion, schema normalization, LLM integration, and pragmatic fallback handling.

## Core features

- **Natural-language food search**
  - users can type plain-English cravings instead of browsing static menu pages
  - the backend returns ranked menu items based on semantic relevance
- **Chat-like recommendation UI**
  - single-screen prompt flow with a lightweight conversational experience
  - result cards display food name, location, meal/station context, and calorie info when available
- **Date, time, and location-aware UX controls**
  - the frontend includes date/time selection and dining-location selection
  - the results view can automatically re-issue recommendation requests when those controls change
- **Structured menu normalization**
  - menu items are normalized into a consistent shape before being sent back to the frontend
  - location IDs are resolved into readable dining hall / retail names
- **Calorie extraction + fallback estimation**
  - the backend attempts to parse calorie values from nutrition metadata
  - if calories are missing, it falls back to lightweight name-based heuristics so the UI still remains informative
- **Graceful AI fallback behavior**
  - if OpenAI ranking is unavailable, the API still returns a usable result set from stored menu data
- **Menu ingestion pipeline prototypes**
  - the repo includes scripts for scraping dining commons and retail menus
  - ingestion logic de-duplicates rows and upserts them into Supabase using a natural-key strategy

## Technical highlights

### 1) Natural-language ranking over structured dining data
The main recommendation endpoint accepts a user prompt, fetches menu records from Supabase, normalizes the fields, and asks an OpenAI model to return a strict JSON ranking of menu-item IDs.

That is a strong full-stack pattern because it separates:

- **storage concerns**: menu items live in a structured table
- **normalization concerns**: calories, meal labels, and locations are cleaned in the API layer
- **ranking concerns**: the LLM is used for semantic ordering rather than raw data storage

This moves the project beyond a static menu browser into an AI-assisted retrieval product.

### 2) Graceful degradation when AI services are unavailable
The backend does not hard-fail if model ranking breaks or no OpenAI key is configured.

Instead, it:

- tries the OpenAI ranking path first
- catches ranking failures safely
- falls back to a default ordered slice of normalized menu items

That is a practical production-oriented decision because it preserves baseline functionality even when an external dependency is unavailable.

### 3) Data normalization and heuristic enrichment
Dining data is messy. Different sources may omit nutrition, use inconsistent naming, or expose only partial metadata.

Food4U addresses that by:

- resolving `location_id` values into readable names
- assigning default meal labels when needed
- scanning nutrition objects for calorie-like keys
- applying fallback calorie estimates based on the item name when no nutrition value exists

This is the type of application-layer cleanup that materially improves UX.

### 4) Ingestion pipeline with de-duplication by natural key
The Python ingestion helpers normalize item names, de-duplicate rows in memory, and bulk-upsert records into Supabase using the natural key:

- `name`
- `location_id`
- `date`
- `meal`

This is a good example of defensive data engineering for scraped content, where duplicate rows are common and source quality is uneven.

### 5) Iterative retrieval architecture
The repo also contains an embeddings job and an earlier vector-search-oriented backend path.

That shows useful engineering iteration:

- start with structured retrieval and prompt-driven ranking
- prototype embedding-based retrieval for stronger candidate generation
- keep the architecture open to hybrid retrieval later

For internship recruiting, this is valuable because it demonstrates experimentation, not just a single hard-coded implementation.

## Tech stack

| Layer | Tools |
|---|---|
| Frontend | React 18, Vite |
| Styling | Bootstrap 5, custom CSS |
| Backend API | Node.js, Express |
| Data store | Supabase |
| AI | OpenAI Chat Completions, optional embeddings pipeline |
| Ingestion / scraping | Python, Playwright, BeautifulSoup, Requests |

## Architecture overview

```text
frontend/
  src/App.jsx              -> main chat-style recommendation experience
  src/index.css            -> app layout, modal, results, and prompt styling
  src/main.jsx             -> frontend entry point

backend/
  index.js                 -> Express API + menu normalization + AI ranking
  db.js                    -> Supabase query helpers
  scrape.py                -> ingestion orchestration for dining data
  dc_playwright.py         -> dynamic dining commons scraping
  retail.py                -> retail menu parsing
  db.py                    -> bulk upsert + dedupe helpers
  embed_menu_items.js      -> embedding generation pipeline prototype
```

## Local setup

### 1) Requirements

- Node.js **18+**
- npm **9+**
- a Supabase project with the expected tables populated
- an OpenAI API key if you want AI ranking enabled

### 2) Start the backend

```bash
cd backend
npm install
```

Create a `.env` file in `backend/` (or otherwise expose these environment variables):

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
PORT=8787
```

Run the API:

```bash
npm run dev
```

If you do not want `nodemon`:

```bash
npm start
```

### 3) Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Then open the local Vite URL shown in the terminal (typically `http://localhost:5173`).

### 4) Optional data-pipeline work

The repo also includes scraping and embedding scripts for menu-data ingestion / enrichment. Those scripts are useful if you want to extend the project into a more complete scheduled data pipeline.

## Example user flows

### Recommendation flow
1. Open the app.
2. Type a query such as “something high protein but not too heavy.”
3. Submit the prompt.
4. The backend fetches menu candidates, normalizes them, ranks them, and returns results.
5. Review the recommended items with dining location and calories.

## Future improvements

- apply stronger backend-side filtering for date, time, and dining-location controls
- use hybrid retrieval: structured filters + embeddings + LLM reranking
- expand nutrition parsing for macros, allergens, and dietary tags
- add caching and request throttling around the recommendation path
- schedule automated ingestion jobs and add monitoring around scraper failures
- add test coverage for ranking, normalization, and ingestion utilities

## License

MIT
