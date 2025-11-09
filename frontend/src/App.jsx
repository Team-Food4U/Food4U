import React, { useState, useEffect, useRef } from "react";

function getNYDateParts() {
  // Use local time directly to avoid off-by-one issues
  const d = new Date();
  const iso = d.toISOString();
  return {
    date: iso.slice(0, 10), // YYYY-MM-DD (local day, via ISO)
    time: d.toTimeString().slice(0, 5), // HH:MM
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

// Hard-code backend URL to avoid env confusion
const API_BASE = "http://127.0.0.1:8787";

export default function App() {
  const defaultParts = useRef(getNYDateParts());

  const twoWeeksParts = useRef(null);
  twoWeeksParts.current = (() => {
    const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;
    const later = new Date(defaultParts.current.ts + twoWeeksMs);
    const iso = later.toISOString();
    return {
      date: iso.slice(0, 10),
      time: later.toTimeString().slice(0, 5),
      iso,
      ts: later.getTime(),
    };
  })();

  const minDate = defaultParts.current.date;
  const maxDate = twoWeeksParts.current.date;

  const [view, setView] = useState("prompt");
  const [date, setDate] = useState(defaultParts.current.date);
  const [time, setTime] = useState(defaultParts.current.time);
  const [openPromptModal, setOpenPromptModal] = useState(false);

  const [dc, setDc] = useState("All DCs");
  const [dcDropdownOpen, setDcDropdownOpen] = useState(false);

  const [results, setResults] = useState([]);
  const [inputText, setInputText] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [backendMode, setBackendMode] = useState(null);
  const [hasOpenAIKey, setHasOpenAIKey] = useState(null);
  const [backendError, setBackendError] = useState(null);

  const dcOptions = [
    "All DCs",
    "Worcester",
    "Franklin",
    "Hampshire",
    "Berkshire",
    "Other (Paid)",
  ];

  const dcRef = useRef();

  useEffect(() => {
    function onDoc(e) {
      if (dcRef.current && !dcRef.current.contains(e.target)) {
        setDcDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = view === "prompt" ? "hidden" : prev || "";
    return () => {
      document.body.style.overflow = prev || "";
    };
  }, [view]);

  function clampTime(t, minT, maxT) {
    if (t < minT) return minT;
    if (t > maxT) return maxT;
    return t;
  }

  function handleDateChange(e) {
    let newDate = e.target.value;
    if (newDate < minDate) newDate = minDate;
    if (newDate > maxDate) newDate = maxDate;

    const minT = newDate === minDate ? defaultParts.current.time : "00:00";
    const maxT = newDate === maxDate ? twoWeeksParts.current.time : "23:59";
    const newTime = clampTime(time, minT, maxT);

    setDate(newDate);
    setTime(newTime);
  }

  function handleTimeChange(e) {
    let newTime = e.target.value;
    const minT = date === minDate ? defaultParts.current.time : "00:00";
    const maxT = date === maxDate ? twoWeeksParts.current.time : "23:59";
    newTime = clampTime(newTime, minT, maxT);
    setTime(newTime);
  }

  function getRightNowLabel() {
    const defaultDate = defaultParts.current.date;
    const defaultTime = defaultParts.current.time;
    const sameDate = date === defaultDate;
    const sameTime = time === defaultTime;
    if (sameDate && sameTime) return "Right now";
    if (sameDate && !sameTime) return `Today, ${formatTimeDisplay(time)}`;
    return `${formatDateDisplay(date)}, ${formatTimeDisplay(time)}`;
  }

  async function runSearch() {
    const promptText = inputText.trim();
    if (!promptText || isSearching) return;

    setIsSearching(true);
    setView("loading");
    setBackendError(null);

    try {
      const body = {
        prompt: promptText,
        query: promptText,
        date,
        time,
        dc, // send the actual dropdown label; backend interprets it
      };

      console.log("Calling backend at", `${API_BASE}/ai/recommend`, body);

      const res = await fetch(`${API_BASE}/ai/recommend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (parseErr) {
        console.error("Failed to parse backend JSON:", parseErr, text);
      }

      if (!res.ok) {
        console.error("Backend HTTP error:", res.status, text);
        setBackendMode(data?.mode || "http_error");
        setHasOpenAIKey(
          typeof data?.hasOpenAIKey === "boolean" ? data.hasOpenAIKey : null
        );
        setBackendError(
          `HTTP ${res.status}${data?.error ? `: ${data.error}` : ""}`
        );
        setResults([]);
        setView("results");
        return;
      }

      if (!data) {
        setBackendMode("bad_json");
        setHasOpenAIKey(null);
        setBackendError("Backend returned invalid JSON.");
        setResults([]);
        setView("results");
        return;
      }

      const items = data.results || [];

      setBackendMode(data.mode || null);
      setHasOpenAIKey(
        typeof data.hasOpenAIKey === "boolean" ? data.hasOpenAIKey : null
      );
      setBackendError(data.error || null);

      const out = items.map((it) => {
        const calories =
          typeof it.calories_kcal === "number" &&
          Number.isFinite(it.calories_kcal)
            ? Math.round(it.calories_kcal)
            : null;

        const serving = it.serving_label || "1 serving";

        return {
          food: it.name || it.food_name || "Unnamed Item",
          dc:
            it.location_name ||
            it.location ||
            it.dc ||
            it.dining_common ||
            "Unknown location",
          area: it.station || it.area || it.meal || "All day",
          cal: calories,
          serving,
        };
      });

      setResults(out.slice(0, 10));
      setView("results");
    } catch (err) {
      console.error("Fetch error talking to backend:", err);
      setBackendMode("network_error");
      setHasOpenAIKey(null);
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

  // Auto-refetch when filters change while on results screen
  useEffect(() => {
    if (view !== "results") return;
    if (!inputText.trim()) return;
    runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dc, date, time]);

  return (
    <div
      className={`app-shell ${
        view === "prompt" ? "fullscreen-prompt" : ""
      }`}
    >
      <div className="header">
        <div className="brand">Food4U</div>
      </div>

      <div
        className={`center-card ${
          view === "prompt" ? "prompt-background" : ""
        }`}
      >
        {openPromptModal && (
          <div
            className="overlay"
            onClick={() => setOpenPromptModal(false)}
          />
        )}

        {view === "prompt" && (
          <div className="prompt-wrapper">
            <div className="prompt-line">
              What are you craving{" "}
              <button
                className="inline-link-btn"
                onClick={() => setOpenPromptModal(true)}
                aria-haspopup="dialog"
              >
                {getRightNowLabel()}
              </button>
              ?
            </div>
          </div>
        )}

        {view === "loading" && (
          <div style={{ fontSize: 20, fontWeight: 600 }}>
            Finding best matches...
          </div>
        )}

        {view === "results" && (
          <>
            <div className="top-filters" ref={dcRef}>
              <div style={{ position: "relative" }}>
                <button
                  className="filter-btn"
                  onClick={() => setDcDropdownOpen(!dcDropdownOpen)}
                >
                  {dc}
                </button>

                {dcDropdownOpen && (
                  <div className="small-modal dc-dropdown" role="menu">
                    <div style={{ marginBottom: 8, fontWeight: 700 }}>
                      Choose Dining Common
                    </div>
                    {dcOptions.map((opt) => (
                      <div key={opt} style={{ padding: "6px 0" }}>
                        <button
                          className="btn btn-sm btn-light"
                          style={{ width: "100%", textAlign: "left" }}
                          onClick={() => {
                            setDc(opt);
                            setDcDropdownOpen(false);
                          }}
                        >
                          {opt}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <button
                  className="filter-btn"
                  onClick={() => setOpenPromptModal(true)}
                >
                  {getRightNowLabel()}
                </button>
              </div>
            </div>

            <div className="results-area">
              <div className="chat-bubble">
                Here&apos;s some options for you:
              </div>

              {(backendMode || hasOpenAIKey !== null) && (
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--muted)",
                    marginBottom: 4,
                  }}
                >
                  Mode: {backendMode ?? "unknown"} | OpenAI key OK:{" "}
                  {hasOpenAIKey === null
                    ? "unknown"
                    : hasOpenAIKey
                    ? "yes"
                    : "no"}
                </div>
              )}

              {backendError && (
                <div
                  style={{
                    fontSize: 12,
                    color: "#f88",
                    marginBottom: 6,
                  }}
                >
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
                <div style={{ color: "var(--muted)" }}>
                  No results for your filters.
                </div>
              )}
            </div>
          </>
        )}

        {openPromptModal && (
          <div className="small-modal" role="dialog" aria-modal="true">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <strong>Pick date & time</strong>
              <button
                className="btn btn-sm btn-outline-secondary"
                onClick={() => setOpenPromptModal(false)}
              >
                Close
              </button>
            </div>

            <label style={{ fontSize: 13, color: "var(--muted)" }}>
              Date
            </label>
            <input
              className="form-control"
              type="date"
              value={date}
              onChange={handleDateChange}
              min={minDate}
              max={maxDate}
            />

            <label
              style={{ fontSize: 13, color: "var(--muted)", marginTop: 8 }}
            >
              Time
            </label>
            <input
              className="form-control"
              type="time"
              value={time}
              onChange={handleTimeChange}
              min={date === minDate ? defaultParts.current.time : "00:00"}
              max={date === maxDate ? twoWeeksParts.current.time : "23:59"}
            />

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginTop: 10,
              }}
            >
              <button
                className="btn btn-primary btn-sm"
                onClick={() => setOpenPromptModal(false)}
              >
                Save
              </button>
            </div>
          </div>
        )}

        <div className="input-area" style={{ marginTop: 16 }}>
          <input
            className="user-input"
            placeholder="Type what you want…"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isSearching) {
                handleSend();
              }
            }}
          />
          <button
            className="send-btn"
            onClick={handleSend}
            disabled={isSearching}
          >
            {isSearching ? "Searching..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
