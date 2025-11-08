/*
  The main UI component for the Food4U app.
  Controls all app state (prompt → loading → results), user input handling, date/time picker logic, Dining Common filters, and displaying recommendations.
  This file is the core of the frontend and orchestrates how the interface behaves.
*/

import React, { useState, useEffect, useRef } from "react";

/* -------------------------
   Helper functions & utils
   ------------------------- */

/* Get current date/time parts in America/New_York timezone.
   We capture date in "YYYY-MM-DD" and time in "HH:MM" (24h) formats, plus an ISO string and timestamp. This is used as the *default* "UMass local" now for the UI.
*/
function getNYDateParts() {
  const local = new Date();
  // Convert to a string in the America/New_York timezone
  const nyStr = local.toLocaleString("en-US", { timeZone: "America/New_York" });
  // Create a Date object from that string so we can read ISO/time parts reliably
  const nyDate = new Date(nyStr);
  const iso = nyDate.toISOString();
  return {
    date: iso.slice(0, 10), // "YYYY-MM-DD"
    time: nyDate.toTimeString().slice(0, 5), // "HH:MM"
    iso,
    ts: nyDate.getTime(), // timestamp in ms
  };
}

/* Convert a "YYYY-MM-DD" string into a short human-friendly date,
   e.g. "Nov 7" — useful for UI labels. If parsing fails, we return the input.
*/
function formatDateDisplay(dateStr) {
  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

/* Convert "HH:MM" (24-hour) into "h:MM AM/PM" for nicer display.
   Example: "14:05" => "2:05 PM"
*/
function formatTimeDisplay(timeStr) {
  if (!timeStr) return "";
  const [hh, mm] = timeStr.split(":").map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return timeStr;
  const ampm = hh >= 12 ? "PM" : "AM";
  const hour12 = ((hh + 11) % 12) + 1; // convert 0->12, 13->1 etc
  return `${hour12}:${String(mm).padStart(2, "0")} ${ampm}`;
}

/* Small mock dataset used while developing (or if backend is not connected).
   Each item has: food name, dining common (dc), area within the DC, calories, and serving size text.
*/
const MOCK_RECOMMENDATIONS = [
  {
    food: "BBQ Pulled Pork Sandwich",
    dc: "Deerfield Commons",
    area: "Grill Station",
    cal: 620,
    serving: "1 sandwich",
  },
  {
    food: "Veggie Stir-Fry Bowl",
    dc: "Worcester Dining Common",
    area: "International",
    cal: 480,
    serving: "1 bowl",
  },
  {
    food: "Classic Cheeseburger",
    dc: "Franklin Dining Common",
    area: "Grill",
    cal: 780,
    serving: "1 burger",
  },
  {
    food: "Caesar Salad with Chicken",
    dc: "Hampshire Dining Common",
    area: "Salad Bar",
    cal: 420,
    serving: "1 plate",
  },
  {
    food: "Margherita Pizza Slice",
    dc: "Berkshire Dining Common",
    area: "Pizza Station",
    cal: 320,
    serving: "1 slice",
  },
  {
    food: "Spicy Tofu Tacos",
    dc: "Deerfield Commons",
    area: "Street Eats",
    cal: 390,
    serving: "2 tacos",
  },
  {
    food: "Grilled Salmon Plate",
    dc: "Worcester Dining Common",
    area: "Seafood",
    cal: 540,
    serving: "1 plate",
  },
  {
    food: "Loaded Nachos",
    dc: "Franklin Dining Common",
    area: "Snack Bar",
    cal: 690,
    serving: "1 plate",
  },
  {
    food: "Falafel Wrap",
    dc: "Hampshire Dining Common",
    area: "Mediterranean",
    cal: 410,
    serving: "1 wrap",
  },
  {
    food: "Chocolate Lava Cake",
    dc: "Berkshire Dining Common",
    area: "Dessert",
    cal: 350,
    serving: "1 cake",
  },
];

/* -------------------------
   Main React component
   ------------------------- */

export default function App() {
  /* DEFAULTS:
     We capture the UMass-local "now" at mount time and store it in a ref.
     useRef lets the value to persist across renders and not trigger re-renders when it is read.
  */
  const defaultParts = useRef(getNYDateParts());

  /* Compute "two weeks later" based on the captured default timestamp.
     We store this in a ref as well (twoWeeksParts.current contains the object).
     Gives us the max allowed date/time the user can pick.
  */
  const twoWeeksParts = useRef(null);
  twoWeeksParts.current = (() => {
    const twoWeeksMs = 14 * 24 * 60 * 60 * 1000; // 14 days in ms
    const later = new Date(defaultParts.current.ts + twoWeeksMs);
    const iso = later.toISOString();
    return {
      date: iso.slice(0, 10), // YYYY-MM-DD
      time: later.toTimeString().slice(0, 5), // HH:MM
      iso,
      ts: later.getTime(),
    };
  })();

  /* Helpful constants: minDate and maxDate as strings (YYYY-MM-DD)
     used to set input[type="date"] min/max attributes.
  */
  const minDate = defaultParts.current.date;
  const maxDate = twoWeeksParts.current.date;

  /* ---------- UI state ---------- */
  // Which view to show: "prompt" (initial), "loading", or "results"
  const [view, setView] = useState("prompt");

  // Selected date and time (strings). Initialize to the captured defaults.
  const [date, setDate] = useState(defaultParts.current.date);
  const [time, setTime] = useState(defaultParts.current.time);

  // Controls the "Pick date & time" modal visibility
  const [openPromptModal, setOpenPromptModal] = useState(false);

  // Dining Common filter (e.g. All DCs, Worcester, Franklin, etc.)
  const [dc, setDc] = useState("All DCs");
  const [dcDropdownOpen, setDcDropdownOpen] = useState(false);

  // Results returned by backend (or mock)
  const [results, setResults] = useState([]);

  // The user's typed prompt in the input box
  const [inputText, setInputText] = useState("");

  // Options for the dining common dropdown
  const dcOptions = [
    "All DCs",
    "Worcester",
    "Franklin",
    "Hampshire",
    "Berkshire",
    "Other (Paid)",
  ];

  // Reference to the DOM node containing the DC dropdown (used for click-outside)
  const dcRef = useRef();

  /* -------------------------
     UX: close DC dropdown when clicking outside
     ------------------------- */
  useEffect(() => {
    function onDoc(e) {
      // If we have a ref and the clicked element is not inside it, close the dropdown
      if (dcRef.current && !dcRef.current.contains(e.target))
        setDcDropdownOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  /* -------------------------
     Disable page scroll while on the fullscreen prompt view
     (keeps the first page perfectly centered and non-scrollable)
     ------------------------- */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = view === "prompt" ? "hidden" : prev || "";
    return () => {
      document.body.style.overflow = prev || "";
    };
  }, [view]);

  /* -------------------------
     Utility: clamp a time string between min and max ("HH:MM")
     If the user chooses a date that is the min or max boundary, we must ensure the time stays within the allowed range.
     ------------------------- */
  function clampTime(t, minT, maxT) {
    if (t < minT) return minT;
    if (t > maxT) return maxT;
    return t;
  }

  /* -------------------------
     Event handlers for the date/time inputs in the modal
     - handleDateChange: ensures selected date stays within min/max and adjusts the time if necessary (so it's valid for that date).
     - handleTimeChange: ensures the time stays within min/max for the current date.
     ------------------------- */
  function handleDateChange(e) {
    let newDate = e.target.value;
    // enforce min/max
    if (newDate < minDate) newDate = minDate;
    if (newDate > maxDate) newDate = maxDate;

    // determine allowed time range for chosen date
    const minT = newDate === minDate ? defaultParts.current.time : "00:00";
    const maxT = newDate === maxDate ? twoWeeksParts.current.time : "23:59";

    // clamp the existing selected time if needed
    const newTime = clampTime(time, minT, maxT);
    setDate(newDate);
    setTime(newTime);
  }

  function handleTimeChange(e) {
    let newTime = e.target.value;
    // allowed range depends on whether the currently selected date is at the min or max bounds
    const minT = date === minDate ? defaultParts.current.time : "00:00";
    const maxT = date === maxDate ? twoWeeksParts.current.time : "23:59";
    newTime = clampTime(newTime, minT, maxT);
    setTime(newTime);
  }

  /* -------------------------
     Human-friendly label logic for the inline "Right now" button.
     Rules:
     - If date & time exactly match captured defaults => show "Right now"
     - If same date but different time => show "Today, <time>"
     - Otherwise => show "<Mon D>, <time>"
     This keeps the button concise while still showing the chosen date/time.
     ------------------------- */
  function getRightNowLabel() {
    const defaultDate = defaultParts.current.date;
    const defaultTime = defaultParts.current.time;
    const sameDate = date === defaultDate;
    const sameTime = time === defaultTime;
    if (sameDate && sameTime) return "Right now";
    if (sameDate && !sameTime) return `Today, ${formatTimeDisplay(time)}`;
    return `${formatDateDisplay(date)}, ${formatTimeDisplay(time)}`;
  }

  /* -------------------------
     handleSend: what happens when the user presses "Send"
     - Validate input
     - Show loading state
     - (Here we simulate a fetch with a timeout and use MOCK_RECOMMENDATIONS)
     - Filter by DC if a specific DC is chosen
     - Set results and switch to the results view
     In a production app you would call your backend API here (fetch/axios).
     ------------------------- */
  async function handleSend() {
  if (!inputText.trim()) return;
  setView("loading");

  try {
    const backendUrl = "http://localhost:8787/ai/recommend";

    const body = {
      query: inputText.trim(),
      dc: dc === "All DCs" ? null : dc,
      date,
      time,
    };

    const res = await fetch(backendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error("Backend request failed");

    const data = await res.json();
    const items = data.results || data.recommendations || [];

    const out = items.map((it) => ({
      food: it.name || it.food_name || "Unnamed Item",
      dc: it.location || it.dc || it.dining_common || "Unknown DC",
      area: it.area || it.station || "General",
      cal: it.calories || it.cal || 0,
      serving: it.serving_size || "1 serving",
    }));

    setResults(out.slice(0, 10));
    setView("results");
  } catch (err) {
    console.error("Recommendation error:", err);
    setResults(MOCK_RECOMMENDATIONS.slice(0, 5));
    setView("results");
  }
}


    // simulate a small delay to mimic network/backend processing
    await new Promise((r) => setTimeout(r, 1200));

    // copy mock data and optionally filter
    let out = MOCK_RECOMMENDATIONS.slice();
    if (dc !== "All DCs") {
      out = out.filter((it) => it.dc.toLowerCase().includes(dc.toLowerCase()));
    }

    // keep only top 10 results and show them
    setResults(out.slice(0, 10));
    setView("results");
  }

  /* -------------------------
     Render
     The JSX below follows a minimal chat-like layout:
     - header with Food4U brand (always visible)
     - center area: prompt / loading / results
     - modal for picking date/time
     - bottom input area
     Comments inline explain each section.
     ------------------------- */
  return (
    <div
      className={`app-shell ${view === "prompt" ? "fullscreen-prompt" : ""}`}
    >
      {/* Header: brand in the top-left (always visible) */}
      <div className="header">
        <div className="brand">Food4U</div>
      </div>

      {/* Center card.
          We apply a different background for the results view vs prompt view
          via the "prompt-background" class (prompt view has no card background). */}
      <div
        className={`center-card ${
          view === "prompt" ? "prompt-background" : ""
        }`}
      >
        {/* If modal is open, show a full-screen overlay that closes the modal when clicked */}
        {openPromptModal && (
          <div className="overlay" onClick={() => setOpenPromptModal(false)} />
        )}

        {/* PROMPT VIEW */}
        {view === "prompt" && (
          <div className="prompt-wrapper">
            <div className="prompt-line">
              {/* The inline button replaces "right now" text and opens the date/time modal */}
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

        {/* LOADING VIEW */}
        {view === "loading" && (
          <div style={{ fontSize: 20, fontWeight: 600 }}>
            Finding best matches...
          </div>
        )}

        {/* RESULTS VIEW */}
        {view === "results" && (
          <>
            {/* Top filters row:
                - DC dropdown (left)
                - Right-now/date-time button (right)
                The dcRef is used to detect clicks outside the dropdown to close it.
            */}
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
                {/* This opens the same Pick date & time modal */}
                <button
                  className="filter-btn"
                  onClick={() => setOpenPromptModal(true)}
                >
                  {getRightNowLabel()}
                </button>
              </div>
            </div>

            {/* Results list area: simple chat-style listing */}
            <div className="results-area">
              <div className="chat-bubble">Here's some options for you:</div>

              {results.map((it, idx) => (
                <div className="item" key={idx}>
                  <div className="title">{it.food}</div>
                  <div className="meta">
                    {it.dc} - {it.area}
                  </div>
                  <div className="cal">
                    {it.cal} cal per {it.serving}
                  </div>
                </div>
              ))}

              {results.length === 0 && (
                <div style={{ color: "var(--muted)" }}>
                  No results for your filters.
                </div>
              )}
            </div>
          </>
        )}

        {/* PICK DATE & TIME MODAL
            - Uses native <input type="date"> and <input type="time">
            - min/max attributes are set from minDate/maxDate and twoWeeksParts
            - When the user saves, we simply close the modal (in the production version,
              you'd typically re-run the search or re-request results from the backend)
        */}
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

            <label style={{ fontSize: 13, color: "var(--muted)" }}>Date</label>
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

        {/* BOTTOM INPUT AREA
            - Text input where user types the food request
            - Press Enter or click Send to trigger handleSend
        */}
        <div className="input-area" style={{ marginTop: 16 }}>
          <input
            className="user-input"
            placeholder="Type what you want…"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSend();
            }}
          />
          <button className="send-btn" onClick={handleSend}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
