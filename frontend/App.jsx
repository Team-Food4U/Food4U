import React, { useState, useEffect, useRef } from "react";

function getNYDateParts() {
  const d = new Date();
  const iso = d.toISOString();
  return {
    date: iso.slice(0, 10),
    time: d.toTimeString().slice(0, 5),
    iso,
    ts: d.getTime(),
  };
}

function formatDateDisplay(dateStr) {
  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

function formatTimeDisplay(timeStr) {
  if (!timeStr) return "";
  const [hh, mm] = timeStr.split(":").map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return timeStr;
  const ampm = hh >= 12 ? "PM" : "AM";
  const hour12 = ((hh + 11) % 12) + 1;
  return `${hour12}:${String(mm).padStart(2, "0")} ${ampm}`;
}

const API_BASE = "http://127.0.0.1:8787";

export default function App() {
  const defaultParts = useRef(getNYDateParts());
  const twoWeeksParts = useRef(() => {
    const later = new Date(defaultParts.current.ts + 14 * 24 * 60 * 60 * 1000);
    const iso = later.toISOString();
    return {
      date: iso.slice(0, 10),
      time: later.toTimeString().slice(0, 5),
    };
  });

  const minDate = defaultParts.current.date;
  const maxDate = twoWeeksParts.current.date;

  const [view, setView] = useState("prompt");
  const [date, setDate] = useState(defaultParts.current.date);
  const [time, setTime] = useState(defaultParts.current.time);
  const [dc, setDc] = useState("All DCs");
  const [results, setResults] = useState([]);
  const [inputText, setInputText] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [backendError, setBackendError] = useState(null);

  async function runSearch() {
    const promptText = inputText.trim();
    if (!promptText || isSearching) return;

    setIsSearching(true);
    setView("loading");
    setBackendError(null);

    try {
      const body = { prompt: promptText, query: promptText, date, time, dc };
      const res = await fetch(`${API_BASE}/ai/recommend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const text = await res.text();
      console.log("Raw backend response:", text);
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = {};
      }

      const items = data.results || [];
      if (!items.length) {
        setResults([]);
        setView("results");
        return;
      }

      const out = items.map((it) => ({
        food: it.name || "Unnamed Item",
        dc: it.location_name || "Unknown location",
        area: it.meal || "All Day",
        cal:
          it.calories_kcal ??
          it.calories ??
          it?.nutrition?.Calories ??
          it?.nutrition?.["Calories per 1 serving"] ??
          null,
        serving: "1 serving",
      }));

      setResults(out.slice(0, 10));
      setView("results");
    } catch (err) {
      console.error("Fetch error:", err);
      setBackendError(`Network error: ${err.message}`);
      setResults([]);
      setView("results");
    } finally {
      setIsSearching(false);
    }
  }

  async function handleSend() {
    if (!inputText.trim() || isSearching) return;
    await runSearch();
  }

  return (
    <div className={`app-shell ${view === "prompt" ? "fullscreen-prompt" : ""}`}>
      <div className="header">
        <div className="brand">Food4U</div>
      </div>

      <div className={`center-card ${view === "prompt" ? "prompt-background" : ""}`}>
        {view === "prompt" && (
          <div className="prompt-wrapper">
            <div className="prompt-line">What are you craving right now?</div>
          </div>
        )}

        {view === "loading" && (
          <div style={{ fontSize: 20, fontWeight: 600 }}>Finding best matches...</div>
        )}

        {view === "results" && (
          <div className="results-area">
            <div className="chat-bubble">Here&apos;s some options for you:</div>

            {backendError && (
              <div style={{ fontSize: 12, color: "#f88", marginBottom: 6 }}>
                {backendError}
              </div>
            )}

            {results.map((it, idx) => (
              <div className="item" key={idx}>
                <div className="title">{it.food}</div>
                <div className="meta">
                  {it.dc} - {it.area}
                </div>
                <div className="cal">
                  {it.cal != null
                    ? `${it.cal} cal per ${it.serving}`
                    : `Calories per ${it.serving} not available`}
                </div>
              </div>
            ))}

            {results.length === 0 && !backendError && (
              <div style={{ color: "var(--muted)" }}>No results for your filters.</div>
            )}
          </div>
        )}

        <div className="input-area" style={{ marginTop: 16 }}>
          <input
            className="user-input"
            placeholder="Type what you want…"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isSearching) handleSend();
            }}
          />
          <button className="send-btn" onClick={handleSend} disabled={isSearching}>
            {isSearching ? "Searching..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
