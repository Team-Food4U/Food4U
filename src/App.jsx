import React, { useState, useRef, useEffect } from "react";

const MOCK_RECOMMENDATIONS = [
  { food: "BBQ Pulled Pork Sandwich", dc: "Deerfield Commons", area: "Grill Station", cal: 620, serving: "1 sandwich" },
  { food: "Veggie Stir-Fry Bowl", dc: "Worcester Dining Common", area: "International", cal: 480, serving: "1 bowl" },
  { food: "Classic Cheeseburger", dc: "Franklin Dining Common", area: "Grill", cal: 780, serving: "1 burger" },
];

function getNYDateParts() {
  const local = new Date();
  const nyStr = local.toLocaleString("en-US", { timeZone: "America/New_York" });
  const nyDate = new Date(nyStr);
  const iso = nyDate.toISOString();
  return { date: iso.slice(0, 10), time: nyDate.toTimeString().slice(0, 5) };
}

export default function App() {
  const defaultParts = useRef(getNYDateParts());
  const [view, setView] = useState("prompt");
  const [inputText, setInputText] = useState("");
  const [results, setResults] = useState([]);
  const [date] = useState(defaultParts.current.date);
  const [time] = useState(defaultParts.current.time);
  const [dc, setDc] = useState("All DCs");

  async function handleSend() {
    if (!inputText.trim()) return;
    setView("loading");

    const backendUrl = "http://localhost:8787/ai/recommend";
    const body = {
      prompt: inputText.trim(),
      date,
      time,
      dc: dc === "All DCs" ? null : dc,
    };

    console.log("📤 Sending to backend:", backendUrl, body);

    try {
      const res = await fetch(backendUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error("Backend request failed");

      const data = await res.json();
      console.log("✅ Backend responded:", data);

      const items = data.results || [];
      if (!items.length) throw new Error("No results");

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
      console.error("❌ Recommendation error:", err);
      setResults(MOCK_RECOMMENDATIONS);
      setView("results");
    }
  }

  return (
    <div className="app-shell">
      <div className="header"><div className="brand">Food4U</div></div>

      <div className="center-card">
        {view === "prompt" && (
          <div className="prompt-wrapper">
            <div className="prompt-line">
              What are you craving right now?
            </div>
          </div>
        )}

        {view === "loading" && (
          <div style={{ fontSize: 20, fontWeight: 600 }}>Finding best matches...</div>
        )}

        {view === "results" && (
          <div className="results-area">
            <div className="chat-bubble">Here’s what I found:</div>
            {results.map((it, i) => (
              <div key={i} className="item">
                <div className="title">{it.food}</div>
                <div className="meta">{it.dc} - {it.area}</div>
                <div className="cal">{it.cal} cal per {it.serving}</div>
              </div>
            ))}
          </div>
        )}

        <div className="input-area" style={{ marginTop: 16 }}>
          <input
            className="user-input"
            placeholder="Type what you want…"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
          />
          <button className="send-btn" onClick={handleSend}>Send</button>
        </div>
      </div>
    </div>
  );
}
