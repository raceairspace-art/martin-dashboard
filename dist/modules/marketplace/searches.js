/* Marketplace — one-off "special searches" (separate from the daily watchlist).
 * Data: data/marketplace/searches/index.json + <slug>.json baked by build_dist.sh.
 * Never merged into the watchlist; no $21k cap / geo rule applied here.
 * Routes: #/marketplace/search/<slug>  and  #/marketplace/search/<slug>/<recordId>
 */
(function (global) {
  const BASE = "data/marketplace/searches/";
  const cache = { index: null, indexPromise: null, docs: {} };

  const TIER_WORD = {
    EXCEPTIONAL: "EXCEPTIONAL DEAL",
    STRONG: "STRONG DEAL",
    FAIR: "FAIR DEAL",
    WEAK: "WEAK DEAL",
    AVOID: "AVOID",
  };

  function esc(s) {
    return MartinData.escapeHtml(s);
  }

  function loadIndex() {
    if (cache.index) return Promise.resolve(cache.index);
    if (!cache.indexPromise) {
      cache.indexPromise = MartinData.fetchJsonOptional(BASE + "index.json").then((idx) => {
        cache.index = idx && Array.isArray(idx.searches) ? idx : { searches: [] };
        return cache.index;
      });
    }
    return cache.indexPromise;
  }

  function loadDoc(entry) {
    if (cache.docs[entry.slug]) return Promise.resolve(cache.docs[entry.slug]);
    return MartinData.fetchJson(BASE + encodeURIComponent(entry.file)).then((doc) => {
      cache.docs[entry.slug] = doc;
      return doc;
    });
  }

  /** Leading tier word of Maggie's free-text assessment ("STRONG (conditional)" → STRONG DEAL). */
  function tierFromText(text) {
    const m = String(text || "").trim().toUpperCase().match(/^(EXCEPTIONAL|STRONG|FAIR|WEAK|AVOID)\b/);
    return m ? TIER_WORD[m[1]] : null;
  }

  function splitMakeModel(model) {
    const s = String(model || "").trim();
    const known = ["Tesla", "Chevrolet", "Ford", "Nissan", "Hyundai", "Kia", "Mazda", "Toyota", "Volkswagen", "Polestar"];
    for (const mk of known) {
      if (s.toLowerCase().startsWith(mk.toLowerCase() + " ")) return { make: mk, model: s.slice(mk.length + 1) };
    }
    return { make: null, model: s || null };
  }

  /**
   * Normalize one search doc into card records. Only maps fields; null stays null.
   * Supports { ranked[], rejects[] } (Maggie one-off format) and { candidates[] } (watchlist-like).
   */
  function normalize(doc) {
    const out = [];
    if (!doc || typeof doc !== "object") return out;
    const photosByUrl = new Map();
    if (Array.isArray(doc.raw_craigslist)) {
      for (const r of doc.raw_craigslist) {
        if (r && r.url && Array.isArray(r.imgs) && r.imgs.length) photosByUrl.set(String(r.url), r.imgs);
      }
    }
    if (Array.isArray(doc.ranked)) {
      doc.ranked.forEach((r, i) => {
        const mm = splitMakeModel(r.model);
        const link = r.link || null;
        out.push({
          _kind: "ranked",
          id: "r" + (r.rank != null ? r.rank : i + 1),
          year: r.year != null ? r.year : null,
          make: mm.make,
          model: mm.model,
          trim: r.trim != null ? r.trim : null,
          fuel: r.fuel != null ? r.fuel : null,
          ask_price: r.price_advertised != null ? r.price_advertised : null,
          price_real_text: r.price_real != null ? r.price_real : null,
          miles: r.mileage != null ? r.mileage : null,
          seller_type: r.seller_type != null ? r.seller_type : null,
          seller: r.seller != null ? r.seller : null,
          location: r.city != null ? r.city : null,
          distance_text: r.distance_from_lv != null ? r.distance_from_lv : null,
          vin: r.vin != null ? r.vin : null,
          title_status: r.title_status != null ? r.title_status : null,
          url: link,
          link_type: r.link_type != null ? r.link_type : null,
          market_comp: r.market_comp != null ? r.market_comp : null,
          notes: r.notes != null ? r.notes : null,
          assessment_raw: r.assessment != null ? r.assessment : null,
          assessment: tierFromText(r.assessment),
          priority_rank: r.rank != null ? r.rank : null,
          estimated_savings: null,
          status: "active",
          photos: link && photosByUrl.has(link) ? photosByUrl.get(link) : [],
        });
      });
    }
    if (Array.isArray(doc.rejects)) {
      doc.rejects.forEach((r, i) => {
        const reason = r.reason != null ? String(r.reason) : "";
        const tier = tierFromText(reason);
        out.push({
          _kind: "reject",
          id: "x" + (i + 1),
          item: r.item != null ? r.item : null,
          reason: reason || null,
          vin: r.vin != null ? r.vin : null,
          url: r.link || null,
          assessment: tier || "AVOID",
          assessment_raw: tier ? reason.split(/[:\s]/)[0] : "REJECTED",
          ask_price: null,
          miles: null,
          status: "rejected",
          photos: r.link && photosByUrl.has(r.link) ? photosByUrl.get(r.link) : [],
        });
      });
    }
    if (Array.isArray(doc.candidates)) {
      doc.candidates.forEach((c) => out.push(Object.assign({ _kind: "candidate" }, c)));
    }
    return out;
  }

  function rejectOrder(c) {
    if (c.assessment_raw === "AVOID") return 0;
    if (c.assessment_raw === "WEAK") return 1;
    return 2;
  }

  function sortRecords(recs) {
    const live = recs.filter((c) => c._kind !== "reject");
    const rej = recs.filter((c) => c._kind === "reject");
    const ranked = MarketplaceModule.sortCandidates(live, Infinity);
    const rejSorted = rej
      .map((c, i) => ({ c, i }))
      .sort((a, b) => rejectOrder(a.c) - rejectOrder(b.c) || a.i - b.i)
      .map((x) => x.c);
    return { ranked, rejects: rejSorted };
  }

  function isPrivateText(s) {
    const t = String(s || "").toLowerCase();
    return t === "private" || t.startsWith("private");
  }

  function chipClass(assessment) {
    if (assessment === "EXCEPTIONAL DEAL") return "exceptional";
    if (assessment === "STRONG DEAL") return "strong";
    if (assessment === "FAIR DEAL") return "fair";
    return "weak";
  }

  function titleOf(c) {
    if (c._kind === "reject") return c.item || c.id;
    return [c.year, c.make, c.model, c.trim].filter((x) => x != null && x !== "").join(" ") || c.id;
  }

  function sellerBadges(c) {
    if (c._kind === "reject") return "";
    let b = "";
    if (isPrivateText(c.seller_type)) b += `<span class="badge private-badge">Private</span>`;
    if (/possible dealer|curbstoner/i.test(String(c.seller_type || "")))
      b += `<span class="badge flag-badge flag-muted" title="${esc(c.seller_type)}">Seller type uncertain</span>`;
    return b;
  }

  function qualifierBadge(c) {
    if (c._kind === "reject" || !c.assessment_raw) return "";
    const base = String(c.assessment_raw).trim().split(/\s+/)[0].toUpperCase();
    if (String(c.assessment_raw).trim().toUpperCase() === base) return "";
    return `<span class="badge flag-badge flag-warn" title="Maggie's assessment">${esc(c.assessment_raw)}</span>`;
  }

  function thumb(c) {
    const src = Array.isArray(c.photos) && c.photos[0];
    if (src) return `<span class="mp-thumb"><img src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" /></span>`;
    const label = c._kind === "reject" ? "X" : (String(c.year || "").slice(-2) + String(c.model || "").slice(0, 2)).toUpperCase();
    return `<span class="mp-thumb placeholder"><span>${esc(label || "—")}</span></span>`;
  }

  function rowHtml(slug, c, selectedId) {
    const { money, miles } = MartinData;
    const href = `#/marketplace/search/${encodeURIComponent(slug)}/${encodeURIComponent(c.id)}`;
    const sel = selectedId === c.id ? "selected" : "";
    if (c._kind === "reject") {
      const label = c.assessment_raw === "AVOID" ? "AVOID" : c.assessment_raw === "WEAK" ? "WEAK" : "REJECTED";
      return `
      <a class="mp-row mp-row-card search-reject ${sel}" href="${href}" data-id="${esc(c.id)}">
        ${thumb(c)}
        <span class="mp-row-main">
          <span class="mp-row-title">${esc(c.item || "—")}</span>
          <span class="reject-reason"><strong>Why:</strong> ${esc(c.reason || "—")}</span>
          <span class="mp-row-sub">VIN ${esc(c.vin || "—")}</span>
        </span>
        <span class="mp-row-meta">
          <span class="badge weak deal-badge">${esc(label)}</span>
          <span class="status-pill">rejected</span>
        </span>
      </a>`;
    }
    return `
      <a class="mp-row mp-row-card ${sel}" href="${href}" data-id="${esc(c.id)}">
        ${thumb(c)}
        <span class="mp-row-main">
          <span class="mp-row-title">${c.priority_rank != null ? `<span class="muted">#${esc(c.priority_rank)}</span> ` : ""}${esc(titleOf(c))}</span>
          <span class="mp-row-sub">${esc(c.location || "—")} · ${esc(c.seller_type || "—")} · ${esc(c.distance_text || "distance —")}${c.fuel ? " · " + esc(c.fuel) : ""}</span>
          <span class="mp-row-mv">${sellerBadges(c)}${qualifierBadge(c)}</span>
        </span>
        <span class="mp-row-meta">
          <span class="mp-row-price">${money(c.ask_price)}</span>
          <span class="mp-row-miles">${miles(c.miles)}</span>
          <span class="badge ${chipClass(c.assessment)} deal-badge">${esc(c.assessment || "—")}</span>
        </span>
      </a>`;
  }

  function detailHtml(slug, c) {
    const { money, miles } = MartinData;
    if (!c) {
      return `<div class="detail-empty"><p class="empty-state">Select a listing to see Maggie's notes, comps, and link.</p></div>`;
    }
    const link = c.url
      ? `<a class="btn-primary" href="${esc(c.url)}" target="_blank" rel="noopener">Open listing ↗</a>`
      : "";
    const photos = Array.isArray(c.photos) ? c.photos.slice(0, 8) : [];
    const gallery = photos.length
      ? `<div class="photo-gallery"><div class="photo-hero"><img src="${esc(photos[0])}" alt="" referrerpolicy="no-referrer" /></div></div>`
      : "";
    if (c._kind === "reject") {
      return `
      <div class="detail-pane search-reject-detail" data-detail-id="${esc(c.id)}">
        ${gallery}
        <div class="detail-header"><div>
          <h3>${esc(c.item || c.id)}</h3>
          <div class="detail-sub"><span class="badge weak deal-badge">${esc(c.assessment_raw === "AVOID" || c.assessment_raw === "WEAK" ? c.assessment_raw : "REJECTED")}</span><span class="status-pill">rejected</span></div>
        </div><div class="detail-actions">${link}</div></div>
        <section class="detail-section concerns"><h4>Maggie's reason</h4><p class="notes-body">${esc(c.reason || "—")}</p></section>
        <dl class="detail-grid"><div><dt>VIN</dt><dd>${esc(c.vin || "—")}</dd></div><div class="span-2"><dt>ID</dt><dd><code>${esc(slug + "/" + c.id)}</code></dd></div></dl>
        <p><a href="#/marketplace/search/${encodeURIComponent(slug)}">← Back to search</a></p>
      </div>`;
    }
    return `
      <div class="detail-pane" data-detail-id="${esc(c.id)}">
        ${gallery}
        <div class="detail-header"><div>
          <h3>${esc(titleOf(c))}</h3>
          <div class="detail-sub">
            <span class="badge ${chipClass(c.assessment)} deal-badge">${esc(c.assessment || "—")}</span>
            ${qualifierBadge(c)}${sellerBadges(c)}
            <span>${esc(c.seller_type || "—")}</span><span>${esc(c.location || "—")}</span>
            ${c.priority_rank != null ? `<span>Maggie rank #${esc(c.priority_rank)}</span>` : ""}
          </div>
        </div><div class="detail-actions">${link}</div></div>
        <div class="detail-price-row">
          <div><div class="price-lg">${money(c.ask_price)}</div><div class="muted">${esc(c.price_real_text || "real price —")}</div></div>
          <div>${miles(c.miles)} · ${esc(c.distance_text || "distance —")}</div>
        </div>
        <dl class="detail-grid">
          <div><dt>Make</dt><dd>${esc(c.make || "—")}</dd></div>
          <div><dt>Model</dt><dd>${esc(c.model || "—")}</dd></div>
          <div><dt>Trim</dt><dd>${esc(c.trim || "—")}</dd></div>
          <div><dt>Fuel</dt><dd>${esc(c.fuel || "—")}</dd></div>
          <div><dt>VIN</dt><dd>${esc(c.vin || "—")}</dd></div>
          <div><dt>Title</dt><dd>${esc(c.title_status || "—")}</dd></div>
          <div><dt>Seller</dt><dd>${esc(c.seller || "—")}</dd></div>
          <div><dt>Link type</dt><dd>${esc(c.link_type || "—")}</dd></div>
          <div class="span-2"><dt>ID</dt><dd><code>${esc(slug + "/" + c.id)}</code></dd></div>
        </dl>
        ${c.market_comp ? `<section class="detail-section"><h4>Market comps</h4><p class="notes-body">${esc(c.market_comp)}</p></section>` : ""}
        <section class="detail-section"><h4>Notes</h4><p class="notes-body">${esc(c.notes || "No notes.")}</p></section>
        <p><a href="#/marketplace/search/${encodeURIComponent(slug)}">← Back to search</a></p>
      </div>`;
  }

  function headerHtml(entry, doc) {
    const gaps = Array.isArray(doc.coverage_gaps) && doc.coverage_gaps.length
      ? `<details class="search-gaps"><summary>Coverage gaps (${doc.coverage_gaps.length})</summary><ul>${doc.coverage_gaps
          .map((g) => `<li>${esc(g)}</li>`)
          .join("")}</ul></details>`
      : "";
    const md = entry.md
      ? ` · <a href="${esc(BASE + entry.md)}" target="_blank" rel="noopener">Maggie's report (.md)</a>`
      : "";
    return `
      <div class="search-header">
        <div class="search-kicker">Special search · separate from the daily watchlist · own criteria (no $21k cap / 250 mi rule)</div>
        <h3>${esc((entry.scope || doc.scope || entry.slug).split(";")[0])}</h3>
        <p class="search-criteria"><strong>Criteria:</strong> ${esc(doc.scope || entry.scope || "—")}</p>
        <p class="muted">Searched ${esc(entry.date)}${doc.generated ? ` · generated ${esc(doc.generated)}` : ""}${md} · <a href="#/marketplace">← Back to watchlist</a></p>
        ${gaps}
      </div>`;
  }

  function renderSearch(data, slug, recordId) {
    const root = document.getElementById("marketplace-module-body");
    if (!root) return;
    const lead = document.querySelector("#view-marketplace > .lead");
    if (lead) lead.textContent = "Special search — a one-off hunt by Maggie with its own criteria. Not part of the daily watchlist or its counts.";
    root.innerHTML = `<p class="empty-state">Loading special search…</p>`;
    loadIndex()
      .then((idx) => {
        const entry = (idx.searches || []).find((e) => e.slug === slug);
        if (!entry) {
          root.innerHTML = `<p class="empty-state">Special search <code>${esc(slug)}</code> not found. <a href="#/marketplace">← Marketplace</a></p>`;
          return null;
        }
        return loadDoc(entry).then((doc) => ({ entry, doc }));
      })
      .then((res) => {
        if (!res) return;
        const { entry, doc } = res;
        const recs = normalize(doc);
        const { ranked, rejects } = sortRecords(recs);
        const selected = recordId ? recs.find((c) => c.id === recordId) || null : null;
        const missing = recordId && !selected
          ? `<div class="detail-pane"><p class="empty-state">Record <code>${esc(recordId)}</code> not in this search.</p></div>`
          : "";
        root.innerHTML = `
          ${headerHtml(entry, doc)}
          <div class="mp-layout">
            <div class="mp-list-pane">
              <div class="mp-list-header"><strong>${ranked.length}</strong> ranked · <strong>${rejects.length}</strong> rejected/avoid · ranked tier → private first → Maggie rank → price</div>
              <div class="mp-list" role="list" id="search-ranked">${ranked.map((c) => rowHtml(entry.slug, c, recordId)).join("") || `<p class="empty-state">No ranked listings.</p>`}</div>
              ${rejects.length ? `<h4 class="search-reject-head">Rejected / AVOID — visible for reference, do not buy without clearing the flag</h4>
              <div class="mp-list" role="list" id="search-rejects">${rejects.map((c) => rowHtml(entry.slug, c, recordId)).join("")}</div>` : ""}
            </div>
            <div class="mp-detail-pane" id="mp-detail">${missing || detailHtml(entry.slug, selected)}</div>
          </div>`;
      })
      .catch((err) => {
        root.innerHTML = `<p class="empty-state">Failed to load special search: ${esc(err.message)}</p>`;
      });
  }

  /** Small link bar on the main Marketplace page. */
  function renderLinks(targetId) {
    loadIndex().then((idx) => {
      const el = document.getElementById(targetId);
      if (!el) return;
      const list = idx.searches || [];
      if (!list.length) {
        el.innerHTML = "";
        return;
      }
      el.innerHTML = `<div class="special-searches-bar"><span class="label">Special searches</span>${list
        .map((e) => {
          const label = (e.scope || e.slug).split(";")[0];
          const n = e.ranked_count != null ? ` · ${e.ranked_count} ranked` : "";
          return `<a class="cat-filter-chip special-search-link" href="#/marketplace/search/${encodeURIComponent(e.slug)}">${esc(label)} · ${esc(e.date)}${esc(n)}</a>`;
        })
        .join("")}</div>`;
    });
  }

  global.MarketplaceSearches = { renderSearch, renderLinks, normalize, sortRecords, loadIndex, tierFromText };
})(window);
