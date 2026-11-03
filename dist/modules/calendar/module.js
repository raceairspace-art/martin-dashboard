/* Calendar module — month grid (desktop) + agenda (mobile), titles only.
   Data: data/calendar/events.json from scripts/ingest_calendar.py
   { months: ["YYYY-MM"...], events: [{title, start, end (inclusive), all_day}] } */
(function (global) {
  const TZ = "America/Los_Angeles";
  const MAX_LANES = 3; // visible bar rows per week before "+N more"
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const esc = (s) => MartinData.escapeHtml(String(s == null ? "" : s));
  const D = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const iso = (d) => d.toISOString().slice(0, 10);
  const addDays = (s, n) => { const d = D(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
  const dow = (s) => D(s).getUTCDay();
  const ymOf = (s) => s.slice(0, 7);
  const shortDate = (s) => { const d = D(s); return `${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCDate()}`; };
  const longDay = (s) => { const d = D(s); return `${DOW[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`; };

  function todayISO() {
    const p = new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const g = (t) => p.find((x) => x.type === t).value;
    return `${g("year")}-${g("month")}-${g("day")}`;
  }

  function chipIdx(title) {
    let h = 0;
    for (const ch of title.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h % 4;
  }

  function normalize(raw) {
    if (!raw || !Array.isArray(raw.events)) return null;
    const events = raw.events
      .filter((e) => e && e.title && /^\d{4}-\d{2}-\d{2}$/.test(e.start || ""))
      .map((e, i) => {
        const end = /^\d{4}-\d{2}-\d{2}$/.test(e.end || "") && e.end >= e.start ? e.end : e.start;
        return { id: i, title: String(e.title), start: e.start, end, allDay: !!e.all_day, multi: end > e.start, c: chipIdx(String(e.title)) };
      })
      .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0) || (b.end > a.end ? 1 : b.end < a.end ? -1 : 0) || a.title.localeCompare(b.title));
    const months = (raw.months || []).filter((m) => /^\d{4}-\d{2}$/.test(m)).sort();
    return { events, months };
  }

  const on = (events, day) => events.filter((e) => e.start <= day && e.end >= day);

  function monthWeeks(ym) {
    const first = ym + "-01";
    let cur = addDays(first, -dow(first));
    const weeks = [];
    do {
      const w = [];
      for (let i = 0; i < 7; i++) { w.push(cur); cur = addDays(cur, 1); }
      weeks.push(w);
    } while (ymOf(cur) === ym);
    return weeks;
  }

  function layoutWeek(week, events) {
    const a = week[0], b = week[6];
    const segs = events
      .filter((e) => e.start <= b && e.end >= a)
      .map((e) => {
        const s = e.start < a ? a : e.start, t = e.end > b ? b : e.end;
        return { e, c0: week.indexOf(s), c1: week.indexOf(t), contL: e.start < a, contR: e.end > b };
      })
      .sort((x, y) => x.c0 - y.c0 || (y.c1 - y.c0) - (x.c1 - x.c0) || (y.e.allDay - x.e.allDay) || x.e.title.localeCompare(y.e.title));
    const lanes = [];
    segs.forEach((sg) => {
      let l = 0;
      while (lanes[l] && lanes[l].some(([p, q]) => !(sg.c1 < p || sg.c0 > q))) l++;
      (lanes[l] = lanes[l] || []).push([sg.c0, sg.c1]);
      sg.lane = l;
    });
    // If only one row would overflow, just show it instead of a "+1 more" row.
    const visible = lanes.length <= MAX_LANES + 1 ? lanes.length : MAX_LANES;
    const hidden = week.map((_, c) => segs.filter((sg) => sg.lane >= visible && sg.c0 <= c && sg.c1 >= c).length);
    return { segs, visible, hidden };
  }

  function pickMonth(route, months, today) {
    const want = route && route.parts && route.parts[1];
    if (want && months.includes(want)) return want;
    const tm = ymOf(today);
    if (months.includes(tm) || !months.length) return tm;
    return months.reduce((best, m) => (Math.abs(D(m + "-01") - D(tm + "-01")) < Math.abs(D(best + "-01") - D(tm + "-01")) ? m : best), months[0]);
  }

  function barHtml(sg, day) {
    const e = sg.e;
    const cls = ["cal-bar", `chip${e.c}`, e.multi || e.allDay ? "solid" : "timed", sg.contL ? "cont-l" : "", sg.contR ? "cont-r" : ""].join(" ");
    const tip = e.multi ? `${e.title} (${shortDate(e.start)} – ${shortDate(e.end)})` : e.title;
    return `<button type="button" class="${cls}" style="grid-column:${sg.c0 + 1} / ${sg.c1 + 2};grid-row:${sg.lane + 2}" title="${esc(tip)}" data-day="${day}" aria-label="${esc(tip)}"><span>${esc(e.title)}</span></button>`;
  }

  function gridHtml(ym, data, today) {
    const weeks = monthWeeks(ym);
    let h = `<div class="cal-grid"><div class="cal-dow">${DOW.map((d, i) => `<div class="${i === 0 || i === 6 ? "we" : ""}">${d}</div>`).join("")}</div>`;
    weeks.forEach((week) => {
      const { segs, visible, hidden } = layoutWeek(week, data.events);
      const anyMore = hidden.some((n) => n > 0);
      const rows = 1 + visible + (anyMore ? 1 : 0);
      h += `<div class="cal-week" style="grid-template-rows:auto repeat(${rows - 1}, var(--lane-h)) 1fr">`;
      week.forEach((day, c) => {
        const cls = ["cal-cell", ymOf(day) !== ym ? "out" : "", day === today ? "today" : "", c === 0 || c === 6 ? "we" : "", day < today ? "past" : ""].join(" ");
        h += `<div class="${cls}" style="grid-column:${c + 1};grid-row:1 / -1"></div>`;
        const n = on(data.events, day).length;
        h += `<button type="button" class="cal-num${day === today ? " is-today" : ""}${ymOf(day) !== ym ? " out" : ""}" style="grid-column:${c + 1};grid-row:1" data-day="${day}" aria-label="${esc(longDay(day))}: ${n} event${n === 1 ? "" : "s"}">${D(day).getUTCDate()}${day === today ? '<span class="cal-today-tag">Today</span>' : ""}</button>`;
        if (hidden[c]) h += `<button type="button" class="cal-more" style="grid-column:${c + 1};grid-row:${visible + 2}" data-day="${day}">+${hidden[c]} more</button>`;
      });
      segs.filter((sg) => sg.lane < visible).forEach((sg) => { h += barHtml(sg, week[sg.c0]); });
      h += `</div>`;
    });
    return h + `</div>`;
  }

  function agendaHtml(ym, data, today) {
    const first = ym + "-01";
    const days = [];
    for (let d = first; ymOf(d) === ym; d = addDays(d, 1)) days.push(d);
    let h = `<ol class="cal-agenda">`;
    days.forEach((day) => {
      const starting = data.events.filter((e) => e.start === day || (day === first && e.start < first && e.end >= first));
      const ongoing = day === today ? data.events.filter((e) => e.start < day && e.end >= day && !(day === first)) : [];
      if (!starting.length && !ongoing.length && day !== today) return;
      const d = D(day);
      h += `<li class="ag-day${day === today ? " today" : ""}${day < today ? " past" : ""}" id="ag-${day}">
        <div class="ag-date"><span class="ag-dow">${DOW[d.getUTCDay()]}</span><span class="ag-num">${d.getUTCDate()}</span>${day === today ? '<span class="ag-today">Today</span>' : ""}</div>
        <ul class="ag-list">`;
      if (!starting.length && !ongoing.length) h += `<li class="ag-empty">Nothing on the calendar</li>`;
      starting.forEach((e) => {
        const note = e.multi ? (e.start < first ? `continues · thru ${shortDate(e.end)}` : `thru ${shortDate(e.end)}`) : "";
        h += `<li class="ag-item chip${e.c}${e.multi || e.allDay ? " solid" : " timed"}"><span class="ag-title">${esc(e.title)}</span>${note ? `<span class="ag-note">${note}</span>` : ""}</li>`;
      });
      ongoing.forEach((e) => {
        h += `<li class="ag-item chip${e.c} solid ongoing"><span class="ag-title">${esc(e.title)}</span><span class="ag-note">ongoing · thru ${shortDate(e.end)}</span></li>`;
      });
      h += `</ul></li>`;
    });
    return h + `</ol>`;
  }

  function dayPopHtml(day, data) {
    const list = on(data.events, day);
    const items = list.length
      ? list.map((e) => `<li class="pop-item chip${e.c}${e.multi || e.allDay ? " solid" : " timed"}"><span class="pop-title">${esc(e.title)}</span>${e.multi ? `<span class="pop-note">${shortDate(e.start)} – ${shortDate(e.end)}</span>` : ""}</li>`).join("")
      : `<li class="pop-empty">Nothing on the calendar.</li>`;
    return `<div class="cal-pop-card" role="dialog" aria-modal="true" aria-label="${esc(longDay(day))}">
      <div class="cal-pop-head"><h4>${esc(longDay(day))}</h4><span class="pop-count">${list.length} event${list.length === 1 ? "" : "s"}</span><button type="button" class="cal-pop-close" aria-label="Close">×</button></div>
      <ul class="pop-list">${items}</ul></div>`;
  }

  let state = null;

  function openDay(root, day) {
    const pop = root.querySelector(".cal-pop");
    if (!pop || !state) return;
    pop.innerHTML = dayPopHtml(day, state.data);
    pop.classList.remove("hidden");
    const btn = pop.querySelector(".cal-pop-close");
    if (btn) btn.focus();
  }
  function closePop(root) {
    const pop = root.querySelector(".cal-pop");
    if (pop) { pop.classList.add("hidden"); pop.innerHTML = ""; }
  }

  function bind(root) {
    if (root.dataset.bound) return;
    root.dataset.bound = "1";
    root.addEventListener("click", (ev) => {
      const pop = ev.target.closest(".cal-pop");
      if (pop) {
        if (ev.target === pop || ev.target.closest(".cal-pop-close")) closePop(root);
        return;
      }
      const t = ev.target.closest("[data-day]");
      if (t) openDay(root, t.getAttribute("data-day"));
    });
    document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") closePop(root); });
  }

  function render(cache, route) {
    const root = document.getElementById("calendar-module-body");
    if (!root) return;
    const data = normalize(cache && cache.calendar);
    if (!data) {
      root.innerHTML = `<p class="empty-state">Calendar data hasn't been baked yet.</p>`;
      return;
    }
    const today = todayISO();
    const ym = pickMonth(route, data.months, today);
    state = { data, ym };
    const [y, m] = ym.split("-").map(Number);
    const th = CalendarThemes.THEMES[m];
    const idx = data.months.indexOf(ym);
    const prev = idx > 0 ? data.months[idx - 1] : null;
    const next = idx >= 0 && idx < data.months.length - 1 ? data.months[idx + 1] : null;
    const mStart = ym + "-01", mEnd = addDays(ymOf(addDays(mStart, 31)) + "-01", -1);
    const count = data.events.filter((e) => e.start <= mEnd && e.end >= mStart).length;
    const nav = (target, dir, label) => target
      ? `<a class="cal-arrow" href="#/calendar/${target}" aria-label="${label}: ${MONTHS[+target.slice(5) - 1]} ${target.slice(0, 4)}">${dir}</a>`
      : `<span class="cal-arrow disabled" aria-hidden="true">${dir}</span>`;

    root.innerHTML = `
      <div class="cal cal-m${m}" style="${CalendarThemes.cssVars(m)}">
        <div class="cal-hero">
          ${CalendarThemes.decorSvg(m)}
          <div class="cal-hero-text">
            <p class="cal-theme">${esc(th.name)} · <span>${esc(th.tagline)}</span></p>
            <h3 class="cal-title">${MONTHS[m - 1]} <span>${y}</span></h3>
            <p class="cal-sub">${count} event${count === 1 ? "" : "s"} this month</p>
          </div>
          <div class="cal-navs">
            ${nav(prev, "‹", "Previous month")}
            ${ymOf(today) !== ym && data.months.includes(ymOf(today)) ? `<a class="cal-jump" href="#/calendar">Today</a>` : ""}
            ${nav(next, "›", "Next month")}
          </div>
        </div>
        ${gridHtml(ym, data, today)}
        ${agendaHtml(ym, data, today)}
        <p class="cal-foot">Titles only · from Google Calendar · tap a day for its full list</p>
        <div class="cal-pop hidden"></div>
      </div>`;
    bind(root);
  }

  function renderHomeStrip(cache) {
    const el = document.getElementById("calendar-strip-body");
    if (!el) return;
    const data = normalize(cache && cache.calendar);
    if (!data) { el.innerHTML = `<p class="empty-state">No calendar data yet.</p>`; return; }
    const today = todayISO();
    const m = +today.slice(5, 7);
    const th = CalendarThemes.THEMES[m];
    const todays = on(data.events, today);
    const upcoming = data.events.filter((e) => e.start > today).slice(0, 3);
    const strip = document.getElementById("strip-calendar");
    if (strip) strip.setAttribute("style", CalendarThemes.cssVars(m));
    el.innerHTML = `
      <a class="cal-tile cal-m${m}" href="#/calendar">
        <div class="cal-tile-hero">${CalendarThemes.decorSvg(m, { width: 600, height: 70, count: 12 })}
          <span class="cal-tile-month">${MONTHS[m - 1]}</span><span class="cal-tile-theme">${esc(th.name)}</span></div>
        <div class="cal-tile-body">
          <p class="cal-tile-label">Today</p>
          <ul class="cal-tile-list">${todays.length ? todays.slice(0, 3).map((e) => `<li class="chip${e.c}" title="${esc(e.title)}">${esc(e.title)}</li>`).join("") + (todays.length > 3 ? `<li class="more">+${todays.length - 3} more</li>` : "") : `<li class="none">Nothing today</li>`}</ul>
          <p class="cal-tile-label">Coming up</p>
          <ul class="cal-tile-list">${upcoming.length ? upcoming.map((e) => `<li class="chip${e.c}" title="${esc(e.title)}"><b>${shortDate(e.start)}</b> ${esc(e.title)}</li>`).join("") : `<li class="none">Nothing scheduled</li>`}</ul>
        </div>
      </a>`;
  }

  global.CalendarModule = { render, _internal: { normalize, layoutWeek, monthWeeks, pickMonth, todayISO } };
  global.CalendarHome = { renderHomeStrip };
})(typeof window !== "undefined" ? window : globalThis);
