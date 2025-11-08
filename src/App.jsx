import React, { useState, useEffect, useRef } from "react";

/* Get current date/time parts in America/New_York timezone */
function getNYDateParts() {
  const local = new Date();
  const nyStr = local.toLocaleString("en-US", { timeZone: "America/New_York" });
  const nyDate = new Date(nyStr);
  const iso = nyDate.toISOString();
  return {
    date: iso.slice(0, 10),
    time: nyDate.toTimeString().slice(0, 5),
    iso,
    ts: nyDate.getTime(),
  };
}

/* Format "YYYY-MM-DD" -> "Mon D" */
function formatDateDisplay(dateStr) {
  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

/* Format "HH:MM" -> "h:MM AM/PM" */
function formatTimeDisplay(timeStr) {
  if (!timeStr) return "";
  const [hh, mm] = timeStr.split(":").map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return timeStr;
  const ampm = hh >= 12 ? "PM" : "AM";
  const hour12 = ((hh + 11) % 12) + 1;
  return `${hour12}:${String(mm).padStart(2, "0")} ${ampm}`;
}

/* Mock recommendations */
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
      if (dcRef.current && !dcRef.current.contains(e.target))
        setDcDropdownOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Disable scroll on prompt
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = view === "prompt" ? "hidden" : prev || "";
    return () => (document.body.style.overflow = prev || "");
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

  async function handleSend() {
    if (!inputText.trim()) return;
    setView("loading");
    await new Promise((r) => setTimeout(r, 1200));
    let out = MOCK_RECOMMENDATIONS.slice();
    if (dc !== "All DCs")
      out = out.filter((it) => it.dc.toLowerCase().includes(dc.toLowerCase()));
    setResults(out.slice(0, 10));
    setView("results");
  }

  return (
    <div
      className={`app-shell ${view === "prompt" ? "fullscreen-prompt" : ""}`}
    >
      {/* Always show header */}
      <div className="header">
        <div className="brand">Food4U</div>
      </div>

      <div
        className={`center-card ${
          view === "prompt" ? "prompt-background" : ""
        }`}
      >
        {openPromptModal && (
          <div className="overlay" onClick={() => setOpenPromptModal(false)} />
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
