/* Weather: #/weather page + Home widget. Data: data/weather/forecast.json (scripts/fetch_weather.py).
   Unknown values render as "—"; nothing is estimated client-side. */
(function (global) {
  const esc = (s) => (global.MartinData && MartinData.escapeHtml ? MartinData.escapeHtml(s) : String(s == null ? "" : s));
  const TZ = "America/Los_Angeles";
  const dash = "—";
  const num = (v, unit) => (v == null || Number.isNaN(Number(v)) ? dash : Math.round(Number(v)) + (unit || ""));

  const svg = (body, cls, label) =>
    `<svg class="${cls || "wx-ic"}" viewBox="0 0 24 24" ${label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"'} fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  const P = {
    sun: '<circle cx="12" cy="12" r="4.2" fill="#fbbf24" stroke="#d97706"/><g stroke="#f59e0b"><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></g>',
    partly: '<circle cx="9" cy="9" r="3.4" fill="#fbbf24" stroke="#d97706"/><g stroke="#f59e0b"><path d="M9 2.8v1.6M2.8 9h1.6M4.6 4.6l1.1 1.1M13.4 4.6l-1.1 1.1"/></g><path d="M8 19.5h9.2a3.6 3.6 0 0 0 .3-7.2 5 5 0 0 0-9.6 1.4A2.9 2.9 0 0 0 8 19.5z" fill="#eef4fb" stroke="#64748b"/>',
    cloud: '<path d="M6.5 18.5h11a4 4 0 0 0 .4-8 5.6 5.6 0 0 0-10.8 1.6A3.2 3.2 0 0 0 6.5 18.5z" fill="#e2e8f0" stroke="#64748b"/>',
    fog: '<path d="M6.5 13.5h11a4 4 0 0 0 .4-8 5.6 5.6 0 0 0-10.8 1.6A3.2 3.2 0 0 0 6.5 13.5z" fill="#e2e8f0" stroke="#64748b"/><path d="M4 17h16M6 20.5h12" stroke="#94a3b8"/>',
    rain: '<path d="M6.5 14.5h11a4 4 0 0 0 .4-8 5.6 5.6 0 0 0-10.8 1.6A3.2 3.2 0 0 0 6.5 14.5z" fill="#e2e8f0" stroke="#64748b"/><path d="M8.5 17.5l-1 2.5M12.5 17.5l-1 2.5M16.5 17.5l-1 2.5" stroke="#2563eb"/>',
    snow: '<path d="M6.5 14.5h11a4 4 0 0 0 .4-8 5.6 5.6 0 0 0-10.8 1.6A3.2 3.2 0 0 0 6.5 14.5z" fill="#e2e8f0" stroke="#64748b"/><path d="M8 18.5h.01M12 20h.01M16 18.5h.01" stroke="#60a5fa" stroke-width="2.6"/>',
    storm: '<path d="M6.5 14h11a4 4 0 0 0 .4-8 5.6 5.6 0 0 0-10.8 1.6A3.2 3.2 0 0 0 6.5 14z" fill="#cbd5e1" stroke="#475569"/><path d="M12.5 14.5l-2.2 3.6h3l-2 3.4" stroke="#d97706"/>',
    wind: '<path d="M3 8.5h10.5a2.5 2.5 0 1 0-2.4-3.2M3 12.5h15a2.8 2.8 0 1 1-2.7 3.6M3 16.5h7"/>',
    drop: '<path d="M12 3.5s5.5 6.2 5.5 10a5.5 5.5 0 0 1-11 0c0-3.8 5.5-10 5.5-10z"/>',
    therm: '<path d="M10 4.5a2 2 0 0 1 4 0v9.3a4 4 0 1 1-4 0z"/><path d="M12 9v7"/>',
    star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z" fill="currentColor"/>',
    pin: '<path d="M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
    wave: '<path d="M3 15c1.5 1.3 3 1.3 4.5 0s3-1.3 4.5 0 3 1.3 4.5 0 3-1.3 4.5 0M3 19c1.5 1.3 3 1.3 4.5 0s3-1.3 4.5 0 3 1.3 4.5 0 3-1.3 4.5 0"/><path d="M8 11.5l4-6 4 6z"/>',
    plane: '<path d="M3 13.5l7-1.5 4.5-6.5h2l-2.2 6 5.2-1 1.5-2h1.5l-1 3.5 1 3.5H21l-1.5-2-5.2-1 2.2 6h-2L10 15z"/>',
    hike: '<path d="M4 20l5.5-9 3.5 5 2.5-3.5L20 20z"/><circle cx="16.5" cy="6" r="1.8"/>',
  };
  function condIcon(code, cls) {
    let k = "cloud";
    if (code == null) k = "cloud";
    else if (code <= 1) k = "sun";
    else if (code === 2) k = "partly";
    else if (code === 3) k = "cloud";
    else if (code === 45 || code === 48) k = "fog";
    else if ((code >= 71 && code <= 77) || code === 85 || code === 86) k = "snow";
    else if (code >= 95) k = "storm";
    else if (code >= 51) k = "rain";
    return svg(P[k], cls || "wx-cond-ic");
  }
  const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const compass = (d) => (d == null ? dash : COMPASS[Math.round(((d % 360) + 360) % 360 / 22.5) % 16]);
  // Arrow points where the wind blows TO (meteorological direction is where it comes FROM).
  function arrow(dir) {
    if (dir == null) return `<span class="wx-arrow wx-arrow-na" aria-hidden="true">${dash}</span>`;
    return `<span class="wx-arrow" title="Wind from ${compass(dir)} (${Math.round(dir)}°)"><svg viewBox="0 0 24 24" aria-hidden="true" style="transform:rotate(${(dir + 180) % 360}deg)"><circle cx="12" cy="12" r="10.5" fill="#eef5fc" stroke="#bcd3ea"/><path d="M12 4.5l4.2 9.5-4.2-2.4-4.2 2.4z" fill="#1f5f99"/><path d="M12 12v7" stroke="#1f5f99" stroke-width="2" stroke-linecap="round"/></svg></span>`;
  }
  const RCLS = { BEST: "best", GOOD: "good", MARGINAL: "marginal", "NO-GO": "nogo" };
  const chip = (r, extra) => `<span class="wx-chip wx-${RCLS[r] || "na"}${extra ? " " + extra : ""}">${esc(r || dash)}</span>`;

  function todayPT() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  }
  function dayLabel(iso, opts) {
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("en-US", Object.assign({ weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }, opts || {}));
  }
  function fmtUpdated(ts) {
    if (!ts) return null;
    return new Date(ts).toLocaleString("en-US", { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " PT";
  }
  // Gordon's "issued" may be a date ("2026-11-03") or date + time ("2026-11-03 15:40 PT"); unknown formats show as-is.
  function issuedLabel(v) {
    const m = /^(\d{4}-\d{2}-\d{2})(?:[ T](.+))?$/.exec(String(v).trim());
    return m ? dayLabel(m[1]) + (m[2] ? ", " + m[2] : "") : String(v);
  }
  function visibleDays(doc) {
    const t = todayPT();
    return ((doc && doc.days) || []).filter((d) => d.date >= t && (!doc.window || !doc.window.end || d.date <= doc.window.end));
  }

  // Gust gauge: 0..30 mph track, sustained fill, gust marker, low-wind (8 mph) tick.
  function gauge(m, rule) {
    const max = 30, pct = (v) => Math.max(0, Math.min(100, (v / max) * 100));
    if (!m || m.sustained == null) return `<div class="wx-gauge wx-gauge-na" aria-hidden="true"></div>`;
    const lim = (rule && rule.sustained_max) || 8;
    const lvl = m.sustained <= lim ? "calm" : m.sustained <= 15 ? "breezy" : "windy";
    return `<div class="wx-gauge" role="img" aria-label="Sustained ${m.sustained} mph, gusts ${num(m.gust)} mph">
      <span class="wx-g-fill wx-g-${lvl}" style="width:${pct(m.sustained)}%"></span>
      ${m.gust != null ? `<span class="wx-g-gust" style="left:${pct(m.gust)}%"></span>` : ""}
      <span class="wx-g-lim" style="left:${pct(lim)}%"></span></div>
      <div class="wx-g-scale" aria-hidden="true"><span>0</span><span style="left:${pct(lim)}%">${lim}</span><span>30 mph</span></div>`;
  }
  function hourly(m) {
    if (!m || !m.hourly || !m.hourly.length) return "";
    const max = 20;
    const bars = m.hourly.map((h) => {
      const w = h.w == null ? 0 : Math.min(h.w, max) / max * 100, g = h.g == null ? null : Math.min(h.g, max) / max * 100;
      const hh = h.h % 12 || 12, ap = h.h < 12 ? "a" : "p";
      return `<span class="wx-hb" title="${hh}${ap}: ${num(h.w)} mph, gusts ${num(h.g)}"><i style="height:${w}%"></i>${g != null ? `<b style="bottom:${g}%"></b>` : ""}</span>`;
    }).join("");
    return `<div class="wx-hourly" aria-label="Hourly wind 7am to 5pm"><div class="wx-hbars">${bars}</div><div class="wx-hlab"><span>7a</span><span>noon</span><span>5p</span></div></div>`;
  }

  function locCard(loc, m, doc) {
    const acts = doc.activities || [];
    if (!m) {
      return `<article class="wx-loc wx-loc-na"><h4>${svg(P.pin, "wx-ic wx-pin")}${esc(loc.name)}</h4>
        <p class="wx-na-msg">Live forecast unavailable ${dash} see the day headline above.</p></article>`;
    }
    const lw = m.low_wind === true ? `<span class="wx-lw yes">Low wind ✓</span>` : m.low_wind === false ? `<span class="wx-lw no">Not low wind</span>` : `<span class="wx-lw">Low wind ${dash}</span>`;
    return `<article class="wx-loc">
      <header><h4>${svg(P.pin, "wx-ic wx-pin")}${esc(loc.name)}</h4>${lw}</header>
      <div class="wx-now">${condIcon(m.code)}<div><div class="wx-temp"><strong>${num(m.high, "°")}</strong><span>/ ${num(m.low, "°F")}</span></div>
        <div class="wx-cond">${esc(m.condition || dash)}</div></div></div>
      <dl class="wx-metrics">
        <div><dt>Wind</dt><dd><strong>${num(m.sustained)}</strong> mph</dd></div>
        <div><dt>Gusts</dt><dd><strong>${num(m.gust)}</strong> mph</dd></div>
        <div><dt>Gust diff</dt><dd><strong>${num(m.diff)}</strong> mph</dd></div>
        <div><dt>From</dt><dd class="wx-dir">${arrow(m.direction)}<strong>${compass(m.direction)}</strong></dd></div>
        <div><dt>Rain</dt><dd><strong>${num(m.rain, "%")}</strong></dd></div>
      </dl>
      ${gauge(m, doc.low_wind_rule)}
      ${hourly(m)}
      <ul class="wx-acts">${acts.map((a) => `<li><span>${esc(a.name.replace(/ \(.*\)$/, ""))}</span>${chip(m.ratings && m.ratings[a.id])}</li>`).join("")}</ul>
    </article>`;
  }

  function headline(day) {
    const h = day.headline;
    if (!h) return `<div class="wx-head-txt"><span class="wx-muted">No headline from Gordon for this day.</span></div>`;
    const bits = [["Wind", h.wind_mph, " mph"], ["Gusts", h.gust_mph, " mph"], ["Gust diff", h.gust_diff_mph, " mph"], ["Highs", h.highs_f, "°F"]]
      .map(([k, v, u]) => `<span><em>${k}</em> ${v == null ? dash : esc(v) + u}</span>`).join("");
    return `<div class="wx-head-txt"><div class="wx-head-line">${chip(h.rating, "wx-chip-lg")}<strong>${esc(h.label || "")}</strong></div>
      <div class="wx-ranges">${bits}</div>${h.note ? `<p class="wx-note">${esc(h.note)}</p>` : ""}</div>`;
  }

  function legend(doc) {
    const rule = doc.low_wind_rule || {};
    const rows = (doc.activities || []).map((a) => `<tr><th scope="row">${esc(a.name)}</th>${["BEST", "GOOD", "MARGINAL"].map((r) => {
      const t = (a.tiers || []).find((x) => x.rating === r);
      if (!t) return "<td>—</td>";
      const parts = [];
      if (t.sustained != null) parts.push(`wind ≤ ${t.sustained}`);
      if (t.gust != null) parts.push(`gust ≤ ${t.gust}`);
      if (t.diff != null) parts.push(t.diff % 1 ? `diff < ${Math.ceil(t.diff)}` : `diff ≤ ${t.diff}`);
      if (t.rain != null) parts.push(`rain ≤ ${t.rain}%`);
      return `<td>${parts.join(", ")}</td>`;
    }).join("")}<td>anything worse</td></tr>`).join("");
    const g = doc.gordon || {};
    return `<section class="wx-legend" aria-label="Definitions and thresholds">
      <h3>How to read this</h3>
      <div class="wx-leg-grid">
        <div><h4>Ratings</h4><p class="wx-leg-chips">${chip("BEST")} ${chip("GOOD")} ${chip("MARGINAL")} ${chip("NO-GO")} ${chip(null)} <span class="wx-muted">= unknown</span></p>
          <p>The big chip on each day is <strong>GoodWeatherGordon's headline rating</strong>, shown as-is. The small chips per location are computed from the forecast with the thresholds below.</p></div>
        <div><h4>Definitions</h4><ul>
          <li><strong>Daytime</strong>: 7am–5pm PT. Wind and gusts are the daytime maximums (mph, 10 m above ground).</li>
          <li><strong>Gust diff</strong>: max gust minus sustained wind.</li>
          <li><strong>Low wind qualifies</strong>: sustained ≤ ${rule.sustained_max ?? 8} mph <em>and</em> gust diff &lt; ${rule.gust_diff_lt ?? 10} mph.</li>
          <li><strong>Gauge</strong>: bar = sustained wind, dark tick = max gust, dashed line = ${rule.sustained_max ?? 8} mph low-wind limit. Arrow points where the wind is blowing.</li>
          <li><strong>Rain</strong>: highest daytime precipitation probability.</li></ul></div>
      </div>
      <div class="wx-table-wrap"><table class="wx-table"><thead><tr><th>Activity (mph)</th><th>${chip("BEST")}</th><th>${chip("GOOD")}</th><th>${chip("MARGINAL")}</th><th>${chip("NO-GO")}</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="wx-src">Sources: Open-Meteo forecast (computed at build time) · GoodWeatherGordon${g.file ? ` (<code>${esc(g.file)}</code>, issued ${esc(g.issued || dash)})` : " (no file)"}.</p>
    </section>`;
  }

  function render(data) {
    const el = document.getElementById("weather-module-body");
    if (!el) return;
    const doc = data && data.weather;
    if (!doc) { el.innerHTML = `<div class="wx-empty">${svg(P.cloud, "wx-empty-ic")}<p>No weather data yet.</p></div>`; return; }
    const days = visibleDays(doc);
    const g = doc.gordon || {};
    const picks = ((g.top_picks && g.top_picks.dates) || []).filter((d) => d >= todayPT());
    const upd = fmtUpdated(doc.updated_at);
    const live = doc.source && doc.source.indexOf("open-meteo") === 0;
    const range = doc.window ? `${dayLabel(doc.window.start, { weekday: undefined })} – ${dayLabel(doc.window.end, { weekday: undefined })}` : "";
    el.innerHTML = `
      <div class="wx">
      <section class="wx-hero">
        <div class="wx-hero-ic">${condIcon(days[0] && days[0].locations.las_vegas ? days[0].locations.las_vegas.code : null, "wx-hero-svg")}</div>
        <div class="wx-hero-txt"><p class="wx-kicker">Las Vegas area · daytime 7am–5pm PT</p>
          <h3>Wind &amp; weather outlook${range ? ` · ${esc(range)}` : ""}</h3>
          <p class="wx-updated">Updated ${upd ? esc(upd) : dash}${g.issued ? ` · Gordon's ratings issued ${esc(issuedLabel(g.issued))}` : ""}</p>
          ${g.all_days ? `<p class="wx-hero-note">${esc(g.all_days)}</p>` : ""}</div>
      </section>
      ${live ? "" : `<div class="wx-warn" role="status">Live forecast unavailable${doc.fetch_error ? ` (${esc(doc.fetch_error)})` : ""}. Showing GoodWeatherGordon's headline ratings only; per-location numbers are “—”.</div>`}
      ${picks.length ? `<section class="wx-picks" aria-label="Top picks"><div class="wx-picks-h">${svg(P.star, "wx-ic wx-star")}<strong>Top picks</strong>${g.top_picks && g.top_picks.activities ? `<span class="wx-muted">for ${esc(g.top_picks.activities)}</span>` : ""}</div>
        <ol>${picks.map((p) => { const d = (doc.days || []).find((x) => x.date === p); const r = d && d.headline && d.headline.rating;
          return `<li><a href="#wx-${p}" data-wx-jump="${p}">${esc(dayLabel(p))} ${chip(r)}</a></li>`; }).join("")}</ol></section>` : ""}
      ${days.length ? days.map((day) => `
        <section class="wx-day${day.top_pick_rank ? " wx-top" : ""}" id="wx-${day.date}">
          <header class="wx-day-h">
            <div class="wx-date"><span>${esc(dayLabel(day.date, { month: undefined, day: undefined, weekday: "long" }))}</span><strong>${esc(dayLabel(day.date, { weekday: undefined }))}</strong>
              ${day.date === todayPT() ? `<em class="wx-today">Today</em>` : ""}
              ${day.top_pick_rank ? `<em class="wx-pick">${svg(P.star, "wx-ic")}Top pick #${day.top_pick_rank}</em>` : ""}</div>
            ${headline(day)}
          </header>
          <div class="wx-locs">${(doc.locations || []).map((loc) => locCard(loc, day.locations && day.locations[loc.id], doc)).join("")}</div>
        </section>`).join("") : `<div class="wx-empty">${svg(P.sun, "wx-empty-ic")}<p>No upcoming days in this forecast window. Gordon refreshes around 6am PT.</p></div>`}
      ${legend(doc)}
      </div>`;
    el.querySelectorAll("[data-wx-jump]").forEach((a) => a.addEventListener("click", (e) => {
      e.preventDefault();
      const t = document.getElementById("wx-" + a.getAttribute("data-wx-jump"));
      if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
    }));
  }

  const RANK = { BEST: 4, GOOD: 3, MARGINAL: 2, "NO-GO": 1 };
  function homeDay(day, doc, label) {
    const lv = day.locations && day.locations.las_vegas;
    let lake = null;
    (doc.locations || []).filter((l) => l.lake).forEach((l) => {
      const m = day.locations && day.locations[l.id];
      const r = m && m.ratings && m.ratings.lake;
      if (r && (!lake || RANK[r] > RANK[lake.r])) lake = { r, name: l.name.replace(/ \(.*\)$/, "") };
    });
    // Flying: Gordon's headline; fallback = derived RC rating at the RC field (Desert Breeze), else Las Vegas.
    const rcLoc = (doc.locations || []).find((l) => l.rc_field);
    const rcm = rcLoc ? day.locations && day.locations[rcLoc.id] : lv;
    const fly = (day.headline && day.headline.rating) || (rcm && rcm.ratings && rcm.ratings.rc) || null;
    return `<a class="wx-hd" href="#/weather">
      <div class="wx-hd-top"><span class="wx-hd-lab">${esc(label)}<small>${esc(dayLabel(day.date))}</small></span>${lv ? condIcon(lv.code, "wx-hd-ic") : condIcon(null, "wx-hd-ic")}</div>
      <div class="wx-hd-temp"><strong>${num(lv && lv.high, "°")}</strong><span>/ ${num(lv && lv.low, "°F")}</span><em>${esc((lv && lv.condition) || "")}</em></div>
      <div class="wx-hd-wind">${svg(P.wind, "wx-ic")}<span><strong>${num(lv && lv.sustained)}</strong> mph · gusts <strong>${num(lv && lv.gust)}</strong></span>${arrow(lv && lv.direction)}</div>
      <ul class="wx-hd-flags">
        <li>${svg(P.hike, "wx-ic")}<span>Outdoors</span>${chip(lv && lv.ratings && lv.ratings.outdoors)}</li>
        <li>${svg(P.wave, "wx-ic")}<span>Lake${lake ? ` <small>(${esc(lake.name)})</small>` : ""}</span>${chip(lake && lake.r)}</li>
        <li>${svg(P.plane, "wx-ic")}<span>Low-wind flying</span>${chip(fly)}</li>
      </ul></a>`;
  }
  const short = (n) => String(n || "").replace(/ \(.*\)$/, "");
  function lakeNote(doc) {
    const lakes = (doc.locations || []).filter((l) => l.lake);
    return lakes.length === 1 ? `lake = ${short(lakes[0].name)}` : `lake = best of ${lakes.length} lakes`;
  }
  function flyNote(doc) {
    const rc = (doc.locations || []).find((l) => l.rc_field);
    return `flying = Gordon's headline${rc ? ` (else ${short(rc.name)} RC)` : ""}`;
  }
  function renderHomeStrip(data) {
    const el = document.getElementById("weather-strip-body");
    if (!el) return;
    const doc = data && data.weather;
    const days = doc ? visibleDays(doc) : [];
    if (!days.length) { el.innerHTML = `<p class="empty-state">No forecast for today. <a href="#/weather">Open weather →</a></p>`; return; }
    const upd = fmtUpdated(doc.updated_at);
    el.innerHTML = `<div class="wx-home">${homeDay(days[0], doc, days[0].date === todayPT() ? "Today" : "Next")}${days[1] ? homeDay(days[1], doc, "Tomorrow") : ""}</div>
      <p class="wx-home-meta">Las Vegas · daytime 7am–5pm · ${esc(lakeNote(doc))} · ${esc(flyNote(doc))} · Updated ${upd ? esc(upd) : dash}</p>`;
  }

  global.WeatherModule = { render };
  global.WeatherHome = { renderHomeStrip };
})(window);
