/* Black Friday 2026 Deals — holiday catalog page (#/black-friday) + Home tile.
 * Data: data/black-friday/deals.json (scripts/ingest_black_friday.py).
 * Tiles show ONLY picture, item, price; the whole tile links to source_url (new tab).
 * Retailer / discount / status / price history stay in the data. */
(function (global) {
  const esc = (s) => MartinData.escapeHtml(s == null ? "" : String(s));

  // Sections come from config/black_friday_sections.json, embedded in deals.json by the
  // ingest as doc.sections (order, title, icon, subsections). Edit that file, not this one.
  function sectionsOf(doc) {
    if (doc && Array.isArray(doc.sections) && doc.sections.length) return doc.sections;
    const ids = [...new Set(((doc && doc.items) || []).map((i) => i.shelf))];
    return ids.map((id) => ({ id, title: id, icon: "gift", subsections: [] }));
  }

  // Simple line icons (24×24, stroke = currentColor)
  const ICONS = {
    gift: '<rect x="3" y="9" width="18" height="12" rx="1"/><path d="M3 13h18M12 9v12M12 9c-2-4-6-4-6-1.5S9 9 12 9zm0 0c2-4 6-4 6-1.5S15 9 12 9z"/>',
    robot: '<rect x="5" y="8" width="14" height="11" rx="2"/><circle cx="9.5" cy="13" r="1.3"/><circle cx="14.5" cy="13" r="1.3"/><path d="M12 8V5M12 4.5h.01M9 17h6M3 12v3M21 12v3"/>',
    monitor: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M9 20h6M12 16v4"/>',
    ski: '<path d="M3 20l18-6M14 4.5a1.5 1.5 0 1 0 0 .01M8 16l3-5 3 2 2-4M5 19l4-9"/><path d="M2 21l9-12 3 5 4-5 4 12"/>',
    plane: '<path d="M2 16l8-3V6a2 2 0 0 1 4 0v7l8 3v2l-8-2v3l2 2v1l-4-1-4 1v-1l2-2v-3l-8 2z"/>',
    ship: '<path d="M3 17l2 4h14l2-4-9-3zM6 15V9h12v6M9 9V5h6v4M2 21c2 0 2-1 4-1s2 1 4 1 2-1 4-1 2 1 4 1 2-1 4-1"/>',
    bed: '<path d="M3 18V7M3 13h18v5M21 18v-3M3 18h18"/><circle cx="7.5" cy="10" r="1.6"/><path d="M11 10h10v3"/>',
    suitcase: '<rect x="4" y="7" width="16" height="13" rx="2"/><path d="M9 7V4h6v3M8 7v13M16 7v13"/>',
    ticket: '<path d="M3 8a2 2 0 0 0 0 4v0a2 2 0 0 1 0 4v2h18v-2a2 2 0 0 1 0-4 2 2 0 0 1 0-4V6H3z"/><path d="M14 6v12" stroke-dasharray="2 2"/>',
    music: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
    masks: '<path d="M3 4h9v6a4.5 4.5 0 0 1-9 0z"/><path d="M12 9h9v6a4.5 4.5 0 0 1-9 0"/><path d="M5.5 7.5h1M8.5 7.5h1M5.5 11.5c1 1 2.5 1 3.5 0M14.5 12.5h1M17.5 12.5h1M14.5 17c1-1 2.5-1 3.5 0"/>',
    crown: '<path d="M3 18h18M4 18L3 7l5 4 4-6 4 6 5-4-1 11"/>',
    pass: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="11" r="2"/><path d="M5.5 16c.8-1.6 1.8-2.2 3-2.2s2.2.6 3 2.2M14 9h4M14 12h4M14 15h2"/>',
    ferris: '<circle cx="12" cy="10" r="7"/><circle cx="12" cy="10" r="1.2"/><path d="M12 3v14M5 10h14M7 5l10 10M17 5L7 15M8 21l4-11 4 11M6 21h12"/>',
    museum: '<path d="M3 9l9-5 9 5M4 9h16M5 9v9M9.5 9v9M14.5 9v9M19 9v9M3 21h18M3 18h18"/>',
    dice: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.2"/><circle cx="16" cy="8" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="8" cy="16" r="1.2"/><circle cx="16" cy="16" r="1.2"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    wave: '<path d="M3 15h11l4-4h2l-2 4h3M6 15l2-3h5M2 19c2 0 2-1 4-1s2 1 4 1 2-1 4-1 2 1 4 1 2-1 4-1"/>',
    moto: '<circle cx="5.5" cy="16.5" r="3.5"/><circle cx="18.5" cy="16.5" r="3.5"/><path d="M5.5 16.5l4-6h5l4 6M14.5 10.5L13 6h3M9 10.5l2.5 6h7"/>',
    rcplane: '<path d="M2 12h20M12 12l-3-7h2l4 7M12 12l-3 7h2l4-7M19 12l1.5-3h1.5L21 12l1 3h-1.5z"/>',
    drone: '<circle cx="5" cy="6" r="2.5"/><circle cx="19" cy="6" r="2.5"/><circle cx="5" cy="18" r="2.5"/><circle cx="19" cy="18" r="2.5"/><rect x="9" y="9.5" width="6" height="5" rx="1"/><path d="M7 7.5l2 2.5M17 7.5l-2 2.5M7 16.5l2-2M17 16.5l-2-2"/>',
    goggles: '<path d="M2 9h20v6a2 2 0 0 1-2 2h-4l-2-2h-4l-2 2H4a2 2 0 0 1-2-2z"/><path d="M6 12h3M15 12h3"/>',
    maker: '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M4 8h16M8 8v4l4 4 4-4V8M9 21v-3h6v3"/>',
    gamepad: '<path d="M7 7h10a5 5 0 0 1 4.9 6l-.7 3.4a2.4 2.4 0 0 1-4.1 1.1L15 15.5H9l-2.1 2a2.4 2.4 0 0 1-4.1-1.1L2.1 13A5 5 0 0 1 7 7z"/><path d="M7 10v3M5.5 11.5h3M15.5 11h.01M17.5 12.5h.01"/>',
    disc: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/><path d="M12 6a6 6 0 0 0-6 6"/>',
    handheld: '<rect x="2" y="7" width="20" height="10" rx="4"/><rect x="7.5" y="9" width="9" height="6" rx="1"/><path d="M4.5 12h1.5M5.25 11.25v1.5M18.5 11h.01M19.5 13h.01"/>',
    pc: '<rect x="3" y="4" width="12" height="9" rx="1"/><path d="M6 17h6M9 13v4"/><rect x="17" y="4" width="4" height="16" rx="1"/><path d="M18.5 7h1M18.5 9.5h1"/>',
    headset: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/><path d="M19 20c0 1-2 2-5 2"/>',
    chip: '<rect x="6" y="6" width="12" height="12" rx="1.5"/><rect x="9.5" y="9.5" width="5" height="5"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>',
  };
  const icon = (name, cls = "bf-ico") =>
    `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.gift}</svg>`;

  function iconFor(it, sections) {
    const sec = sections.find((x) => x.id === it.shelf) || {};
    const sub = (sec.subsections || []).find((x) => x.id === it.sub) || {};
    return sub.icon || sec.icon || "gift";
  }

  function priceText(it) {
    if (it.price_label) return it.price_label;
    if (typeof it.price !== "number") return "See deal";
    const cents = !Number.isInteger(it.price);
    return "$" + it.price.toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 });
  }

  const safeHref = (u) => (/^https?:\/\//i.test(u || "") ? u : null);

  function tile(it, sections) {
    const href = safeHref(it.source_url);
    const pic = it.image
      ? `<img src="${esc(it.image)}" alt="${esc(it.image_alt || it.item)}" decoding="async" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'bf-ph-fallback'}));this.closest('.bf-pic')&&this.closest('.bf-pic').classList.add('bf-ph')">`
      : "";
    const ph = `<span class="bf-ph-inner" aria-hidden="true">${icon(iconFor(it, sections), "bf-ph-ico")}<span class="bf-ph-bow"></span></span>`;
    const ribbon = it.new_release ? `<span class="bf-ribbon">New release</span>` : "";
    const inner = `
      <span class="bf-pic${it.image ? "" : " bf-ph"}">${pic}${ph}${ribbon}</span>
      <span class="bf-name">${esc(it.item)}</span>
      <span class="bf-price${it.price == null && !it.price_label ? " bf-see" : ""}">${esc(priceText(it))}</span>`;
    const cls = `bf-tile${it.deal_status === "expired" ? " bf-expired" : ""}`;
    return href
      ? `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener noreferrer" title="${esc(it.item)}">${inner}</a>`
      : `<div class="${cls}">${inner}</div>`;
  }

  const grid = (items, sections) => `<div class="bf-grid">${items.map((i) => tile(i, sections)).join("")}</div>`;

  function shelfBody(shelf, items, sections) {
    const subs = (shelf.subsections || []).filter((sub) => items.some((i) => i.sub === sub.id));
    if (!subs.length) return grid(items, sections);
    const rest = items.filter((i) => !subs.some((sub) => sub.id === i.sub));
    return subs.map((sub) => `<h4 class="bf-sub">${icon(sub.icon || shelf.icon)}${esc(sub.title)}</h4>${grid(items.filter((i) => i.sub === sub.id), sections)}`).join("") +
      (rest.length ? `<h4 class="bf-sub">${icon(shelf.icon)}More</h4>${grid(rest, sections)}` : "");
  }

  function lastUpdated(doc) {
    return doc && doc.updated_at ? MartinData.formatTs(doc.updated_at) : null;
  }

  let showExpired = false;

  function render(cache) {
    const el = document.getElementById("black-friday-module-body");
    if (!el) return;
    const doc = cache && cache.blackFriday;
    const all = (doc && Array.isArray(doc.items) ? doc.items : []).filter((i) => i && i.item);
    const visible = all.filter((i) => showExpired || i.deal_status !== "expired");
    const expiredN = all.filter((i) => i.deal_status === "expired").length;
    const upd = lastUpdated(doc);
    const SHELVES = sectionsOf(doc);
    const hero = `
      <div class="bf-hero">
        <div class="bf-hero-snow" aria-hidden="true"></div>
        <p class="bf-kicker">Holiday catalog</p>
        <h3 class="bf-title">Black Friday 2026 Deals</h3>
        <p class="bf-updated">${upd ? "Last updated " + esc(upd) : "Not swept yet"}</p>
      </div>`;
    if (!visible.length) {
      el.innerHTML = hero + `<div class="bf-empty">${icon("gift", "bf-empty-ico")}<p><b>No deals yet.</b></p><p>BlackFridayFrank and Travelin Sam's sweeps will appear here after the next build.</p>${expiredN && !showExpired ? `<button class="bf-toggle" type="button" data-bf-expired>Show ${expiredN} expired</button>` : ""}</div>`;
    } else {
      const sections = SHELVES.map((s) => {
        const items = visible.filter((i) => i.shelf === s.id);
        if (!items.length) return "";
        return `<section class="bf-shelf bf-shelf-${s.id}" id="bf-${s.id}" aria-label="${esc(s.title)}">
          <h3 class="bf-shelf-title">${icon(s.icon)}<span>${esc(s.title)}</span><span class="bf-count">${items.length}</span></h3>
          ${shelfBody(s, items, SHELVES)}</section>`;
      }).join("");
      const jump = SHELVES.filter((s) => visible.some((i) => i.shelf === s.id))
        .map((s) => `<a href="#bf-${s.id}" data-bf-jump="bf-${s.id}">${esc(s.title)}</a>`).join("");
      el.innerHTML = hero + `<nav class="bf-jump" aria-label="Sections">${jump}</nav>` + sections +
        (expiredN ? `<p class="bf-foot"><button class="bf-toggle" type="button" data-bf-expired>${showExpired ? "Hide" : "Show"} ${expiredN} expired deal${expiredN === 1 ? "" : "s"}</button></p>` : "");
    }
    el.querySelectorAll("[data-bf-expired]").forEach((b) => b.addEventListener("click", () => { showExpired = !showExpired; render(cache); }));
    // Jump links must not change the hash route
    el.querySelectorAll("[data-bf-jump]").forEach((a) => a.addEventListener("click", (e) => {
      e.preventDefault();
      const t = document.getElementById(a.getAttribute("data-bf-jump"));
      if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
    }));
  }

  function renderHomeStrip(cache) {
    const el = document.getElementById("black-friday-strip-body");
    if (!el) return;
    const doc = cache && cache.blackFriday;
    const live = (doc && Array.isArray(doc.items) ? doc.items : []).filter((i) => i && i.item && i.deal_status !== "expired");
    if (!live.length) { el.innerHTML = `<a class="bf-home" href="#/black-friday"><span class="bf-home-text"><b>No deals yet</b><span>Sweeps land Mon/Wed/Fri</span></span></a>`; return; }
    const SHELVES = sectionsOf(doc);
    // one distinct picture per shelf first, then any other distinct ones
    const seen = new Set(), thumbs = [];
    const take = (i) => { if (i.image && !seen.has(i.image) && thumbs.length < 5) { seen.add(i.image); thumbs.push(i); } };
    SHELVES.forEach((s) => { const i = live.find((x) => x.shelf === s.id && x.image && !seen.has(x.image)); if (i) take(i); });
    live.forEach(take);
    const upd = lastUpdated(doc);
    el.innerHTML = `<a class="bf-home" href="#/black-friday">
      <span class="bf-home-text"><b>${live.length} deals</b><span>${SHELVES.filter((s) => live.some((i) => i.shelf === s.id)).map((s) => esc(s.title)).join(" · ")}</span>${upd ? `<span class="bf-home-upd">Updated ${esc(upd)}</span>` : ""}</span>
      <span class="bf-home-thumbs" aria-hidden="true">${thumbs.map((i) => `<img src="${esc(i.image)}" alt="">`).join("")}</span></a>`;
  }

  global.BlackFridayModule = { render, _internal: { priceText, iconFor, sectionsOf } };
  global.BlackFridayHome = { renderHomeStrip };
})(typeof window !== "undefined" ? window : globalThis);
