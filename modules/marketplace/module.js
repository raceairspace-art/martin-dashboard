/* Marketplace module — multi-category vehicle deals, $21k budget, private-weighted ranking */
(function (global) {
  const ACTIVEish = new Set(["active", "active_possibly_stale"]);
  const DEADISH = new Set([
    "sold_or_removed",
    "likely_sold_or_stale",
    "possibly_sold_or_stale",
    "rejected",
    "unverified_stale",
  ]);
  const PRODUCT_BUDGET = 21000;

  const ASSESSMENT_RANK = {
    "EXCEPTIONAL DEAL": 0,
    "STRONG DEAL": 1,
    "FAIR DEAL": 2,
    "WEAK DEAL": 3,
    AVOID: 4,
    "SOLD/REMOVED": 5,
  };

  const CATEGORY_META = {
    ev: { id: "ev", label: "EVs", chip: "cat-ev" },
    mach_e: { id: "mach_e", label: "Mach-E", chip: "cat-mache" },
    suv_hyundai: { id: "suv_hyundai", label: "Hyundai SUVs", chip: "cat-suv" },
    suv_mazda: { id: "suv_mazda", label: "Mazda SUVs", chip: "cat-suv" },
    suv_toyota: { id: "suv_toyota", label: "Toyota SUVs", chip: "cat-suv" },
    other: { id: "other", label: "Other", chip: "cat-other" },
  };

  const FILTER_CHIPS = [
    { id: "all", label: "All" },
    { id: "ev", label: "EVs" },
    { id: "mach_e", label: "Mach-E" },
    { id: "suv_hyundai", label: "Hyundai SUVs" },
    { id: "suv_mazda", label: "Mazda SUVs" },
    { id: "suv_toyota", label: "Toyota SUVs" },
  ];

  const state = {
    filters: {
      assessment: "",
      status: "",
      seller_type: "",
      category: "all",
      max_distance: "",
      max_miles: "",
      min_year: "",
      favorites_only: false,
      include_over_budget: false,
      q: "",
    },
    selectedId: null,
  };

  function budgetCap(watchlist) {
    const fromWl = Number(watchlist && watchlist.max_purchase_price);
    if (!Number.isNaN(fromWl) && fromWl > 0) return Math.min(fromWl, PRODUCT_BUDGET);
    return PRODUCT_BUDGET;
  }

  function realAsk(c) {
    if (c == null) return null;
    if (c.ask_price != null && c.ask_price !== "") return Number(c.ask_price);
    if (c.real_price_est != null && c.real_price_est !== "") return Number(c.real_price_est);
    return null;
  }

  function isOverBudget(c, budget) {
    const p = realAsk(c);
    if (p == null || Number.isNaN(p)) return false;
    return p > budget;
  }

  function isPrivate(seller) {
    return String(seller || "").toLowerCase() === "private";
  }

  /** Use Maggie category when present; otherwise infer conservatively. */
  function resolveCategory(c) {
    const raw = c && c.category != null ? String(c.category).trim() : "";
    if (raw && CATEGORY_META[raw]) return raw;
    if (raw === "ev" || raw === "mach_e" || raw === "suv_hyundai" || raw === "suv_mazda" || raw === "suv_toyota")
      return raw;
    const hay = [c && c.make, c && c.model, c && c.title, c && c.trim, c && c.notes, c && c.id]
      .map((x) => String(x || "").toLowerCase())
      .join(" ");
    if (/mach[\s\-]?e\b|mustang\s+mach|mach-e/.test(hay) || /mache/.test(hay.replace(/\s+/g, ""))) {
      return "mach_e";
    }
    // Ford Mustang Mach-E VIN prefix (existing watchlist rows lack category/make/model)
    if (c && c.vin && /^3FMT/i.test(String(c.vin))) return "mach_e";
    return "other";
  }

  function categoryLabel(cat) {
    return (CATEGORY_META[cat] && CATEGORY_META[cat].label) || "Unknown";
  }

  function categoryChipClass(cat) {
    return (CATEGORY_META[cat] && CATEGORY_META[cat].chip) || "cat-other";
  }

  function displayTitle(c) {
    const year = c.year != null ? String(c.year) : "";
    const make = c.make ? String(c.make).trim() : "";
    const model = c.model ? String(c.model).trim() : "";
    const trim = c.trim ? String(c.trim).trim() : "";
    if (make || model) {
      return [year, make, model, trim].filter(Boolean).join(" ").trim();
    }
    const cat = resolveCategory(c);
    if (cat === "mach_e" && (year || trim)) {
      return [year, "Mach-E", trim].filter(Boolean).join(" ").trim();
    }
    return [year, trim].filter(Boolean).join(" ").trim() || c.id;
  }

  function geoPreferScore(c) {
    // Lower is better. geo_tier 1 = Las Vegas / Southern Nevada.
    if (c.geo_tier != null && c.geo_tier !== "") {
      const t = Number(c.geo_tier);
      if (!Number.isNaN(t)) return t;
    }
    const loc = String(c.location || "").toLowerCase();
    if (/\blas vegas\b|\bhenderson\b|\bmesquite\b|\bnevada\b|\bnv\b/.test(loc)) return 1;
    if (c.distance_mi != null && !Number.isNaN(Number(c.distance_mi))) {
      const d = Number(c.distance_mi);
      if (d <= 80) return 1;
      if (d <= 250) return 2;
      return 3;
    }
    return 9;
  }

  function assessmentChip(assessment) {
    if (assessment === "EXCEPTIONAL DEAL") return "exceptional";
    if (assessment === "STRONG DEAL") return "strong";
    if (assessment === "FAIR DEAL") return "fair";
    if (assessment === "WEAK DEAL" || assessment === "AVOID") return "weak";
    return "fair";
  }

  function photoUrl(c) {
    const photos = c && c.photos;
    if (Array.isArray(photos) && photos.length && typeof photos[0] === "string" && photos[0]) {
      return photos[0];
    }
    return null;
  }

  function allPhotos(c) {
    const photos = c && c.photos;
    if (!Array.isArray(photos)) return [];
    return photos.filter((p) => typeof p === "string" && p);
  }

  function initialsPlaceholder(c) {
    const y = c.year != null ? String(c.year).slice(-2) : "??";
    const make = String(c.make || "").trim();
    const model = String(c.model || c.trim || "VE").trim();
    const parts = (make ? make + " " + model : model).split(/\s+/).filter(Boolean);
    const letters =
      (parts[0] ? parts[0][0] : "V") +
      (parts[1] ? parts[1][0] : parts[0] && parts[0][1] ? parts[0][1] : "E");
    return { mono: (y + letters).toUpperCase().slice(0, 4), label: displayTitle(c) };
  }

  function uniqueValues(candidates, key) {
    const set = new Set();
    for (const c of candidates) {
      if (c[key] != null && c[key] !== "") set.add(String(c[key]));
    }
    return Array.from(set).sort();
  }

  function categoryCounts(candidates) {
    const counts = { all: candidates.length };
    for (const chip of FILTER_CHIPS) {
      if (chip.id === "all") continue;
      counts[chip.id] = 0;
    }
    counts.other = 0;
    for (const c of candidates) {
      const cat = resolveCategory(c);
      if (counts[cat] == null) counts[cat] = 0;
      counts[cat] += 1;
    }
    return counts;
  }

  function applyFilters(candidates, budget) {
    const f = state.filters;
    return candidates.filter((c) => {
      if (f.assessment && c.assessment !== f.assessment) return false;
      if (f.status && c.status !== f.status) return false;
      if (f.seller_type && String(c.seller_type).toLowerCase() !== f.seller_type.toLowerCase())
        return false;
      if (f.category && f.category !== "all") {
        if (resolveCategory(c) !== f.category) return false;
      }
      if (!f.include_over_budget && isOverBudget(c, budget)) return false;
      if (f.max_distance !== "" && f.max_distance != null) {
        const maxD = Number(f.max_distance);
        if (!Number.isNaN(maxD) && (c.distance_mi == null || Number(c.distance_mi) > maxD))
          return false;
      }
      if (f.max_miles !== "" && f.max_miles != null) {
        const maxM = Number(f.max_miles);
        if (!Number.isNaN(maxM) && (c.miles == null || Number(c.miles) > maxM)) return false;
      }
      if (f.min_year !== "" && f.min_year != null) {
        const minY = Number(f.min_year);
        if (!Number.isNaN(minY) && (c.year == null || Number(c.year) < minY)) return false;
      }
      if (f.favorites_only && !MartinData.isFavorite(c.id)) return false;
      if (f.q) {
        const q = f.q.toLowerCase();
        const hay = [
          c.id,
          c.make,
          c.model,
          c.trim,
          c.location,
          c.vin,
          c.notes,
          c.assessment,
          c.status,
          c.why_interesting,
          c.concerns,
          c.category,
          resolveCategory(c),
          categoryLabel(resolveCategory(c)),
        ]
          .map((x) => String(x || "").toLowerCase())
          .join(" ");
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  /**
   * Ranking: active-ish first; then assessment tier; private > dealer;
   * estimated_savings desc; price asc; Las Vegas / Southern Nevada (geo) first on ties.
   * Over-budget sorts below in-budget when both are shown.
   */
  function sortCandidates(list, budget) {
    const cap = budget != null ? budget : PRODUCT_BUDGET;
    return list.slice().sort((a, b) => {
      const aDead = DEADISH.has(a.status) ? 1 : 0;
      const bDead = DEADISH.has(b.status) ? 1 : 0;
      if (aDead !== bDead) return aDead - bDead;

      const aActive = ACTIVEish.has(a.status) ? 0 : 1;
      const bActive = ACTIVEish.has(b.status) ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;

      const aOver = isOverBudget(a, cap) ? 1 : 0;
      const bOver = isOverBudget(b, cap) ? 1 : 0;
      if (aOver !== bOver) return aOver - bOver;

      const ra = ASSESSMENT_RANK[a.assessment] != null ? ASSESSMENT_RANK[a.assessment] : 9;
      const rb = ASSESSMENT_RANK[b.assessment] != null ? ASSESSMENT_RANK[b.assessment] : 9;
      if (ra !== rb) return ra - rb;

      const privA = isPrivate(a.seller_type) ? 0 : 1;
      const privB = isPrivate(b.seller_type) ? 0 : 1;
      if (privA !== privB) return privA - privB;

      const savA = a.estimated_savings != null ? Number(a.estimated_savings) : null;
      const savB = b.estimated_savings != null ? Number(b.estimated_savings) : null;
      if (savA != null && savB != null && savA !== savB) return savB - savA;
      if (savA != null && savB == null) return -1;
      if (savA == null && savB != null) return 1;

      const pa = realAsk(a);
      const pb = realAsk(b);
      const priceA = pa != null && !Number.isNaN(pa) ? pa : 999999;
      const priceB = pb != null && !Number.isNaN(pb) ? pb : 999999;
      if (priceA !== priceB) return priceA - priceB;

      const ga = geoPreferScore(a);
      const gb = geoPreferScore(b);
      if (ga !== gb) return ga - gb;

      return 0;
    });
  }

  function marketValueHtml(c) {
    const { money } = MartinData;
    if (c.market_value_low != null && c.market_value_high != null) {
      return `<span class="mv-band">Market ${money(c.market_value_low)}–${money(c.market_value_high)}</span>`;
    }
    return `<span class="mv-band pending">Market value: pending</span>`;
  }

  function medianHint(c, watchlist) {
    const { money, escapeHtml } = MartinData;
    const ms = (watchlist && watchlist.market_snapshot) || {};
    const year = c.year;
    const trim = String(c.trim || "").toLowerCase();
    let key = null;
    let label = null;
    if (year === 2022 && trim.includes("premium")) {
      key = "2022_premium_awd_pattern_median_ask";
      label = "2022 Premium AWD median ask";
    } else if (year === 2022 && trim.includes("select")) {
      key = "2022_select_median_ask";
      label = "2022 Select median ask";
    } else if (year === 2023 && trim.includes("select")) {
      key = "2023_select_median_ask";
      label = "2023 Select median ask";
    } else if (year === 2022) {
      key = "2022_all_median_ask";
      label = "2022 all median ask";
    } else if (year === 2023) {
      key = "2023_all_median_ask";
      label = "2023 all median ask";
    }
    const median = key && ms[key] != null ? Number(ms[key]) : null;
    if (median == null || c.ask_price == null) {
      return `<p class="compare-hint muted">Best Current / market median: pending for this trim pattern.</p>`;
    }
    const delta = Number(c.ask_price) - median;
    const dir = delta < 0 ? "below" : delta > 0 ? "above" : "at";
    const abs = money(Math.abs(delta));
    return `<p class="compare-hint">vs ${escapeHtml(label)} ${money(median)}: <strong>${abs} ${dir}</strong> market median ask.</p>`;
  }

  function sparklineSvg(history) {
    const pts = (history || [])
      .map((h) => ({
        date: h.date,
        price: h.price != null ? Number(h.price) : null,
      }))
      .filter((h) => h.price != null && !Number.isNaN(h.price));
    if (pts.length < 2) return "";
    const prices = pts.map((p) => p.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const w = 200;
    const h = 48;
    const pad = 4;
    const span = max - min || 1;
    const coords = pts
      .map((p, i) => {
        const x = pad + (i / (pts.length - 1)) * (w - pad * 2);
        const y = pad + (1 - (p.price - min) / span) * (h - pad * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    return `<svg class="sparkline" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline fill="none" stroke="currentColor" stroke-width="2" points="${coords}"/></svg>`;
  }

  function priceHistoryList(history) {
    const { escapeHtml, money, formatDate } = MartinData;
    const rows = (history || []).slice().reverse();
    if (!rows.length) return `<p class="empty-state">No price history.</p>`;
    return `<ul class="price-history-list">${rows
      .map((h) => {
        const price = h.price != null ? money(h.price) : "—";
        const note = h.note ? ` · ${escapeHtml(h.note)}` : "";
        return `<li><span class="ph-date">${escapeHtml(formatDate(h.date))}</span> <strong>${price}</strong>${note}</li>`;
      })
      .join("")}</ul>`;
  }

  function renderRunCoverage(daily) {
    const { escapeHtml, formatTs } = MartinData;
    if (!daily) {
      return `<div class="run-coverage muted">No daily hunt baked into dist yet.</div>`;
    }
    const buckets = [];
    for (const [k, v] of Object.entries(daily)) {
      if (Array.isArray(v)) buckets.push(`${k}: ${v.length}`);
    }
    return `
      <div class="run-coverage">
        <div class="run-lead"><strong>Latest hunt</strong> · ${escapeHtml(formatTs(daily.run_at))}
          ${daily.quiet ? ' · <span class="badge quiet">quiet</span>' : ""}</div>
        <p class="run-alert">${escapeHtml(daily.alert_lead || "—")}</p>
        <div class="run-buckets">${buckets.map((b) => `<span class="bucket-chip">${escapeHtml(b)}</span>`).join("")}</div>
      </div>`;
  }

  function renderCategoryChips(candidates) {
    const { escapeHtml } = MartinData;
    const counts = categoryCounts(candidates);
    const cur = state.filters.category || "all";
    const buttons = FILTER_CHIPS.filter((chip) => chip.id === "all" || (counts[chip.id] || 0) > 0)
      .map((chip) => {
        const n = counts[chip.id] || 0;
        const active = cur === chip.id ? "active" : "";
        return `<button type="button" class="cat-filter-chip ${active}" data-category="${escapeHtml(chip.id)}">${escapeHtml(chip.label)} <span class="cat-count">${n}</span></button>`;
      })
      .join("");
    return `<div class="cat-filter-bar" role="toolbar" aria-label="Vehicle category">${buttons}</div>`;
  }

  function renderFilters(candidates, budget) {
    const { escapeHtml, money } = MartinData;
    const assessments = uniqueValues(candidates, "assessment");
    const statuses = uniqueValues(candidates, "status");
    const sellers = uniqueValues(candidates, "seller_type");
    const f = state.filters;
    const opt = (vals, cur) =>
      vals
        .map(
          (v) =>
            `<option value="${escapeHtml(v)}" ${v === cur ? "selected" : ""}>${escapeHtml(v)}</option>`
        )
        .join("");

    const overCount = candidates.filter((c) => isOverBudget(c, budget)).length;

    return `
      ${renderCategoryChips(candidates)}
      <form class="filter-bar" id="mp-filters" autocomplete="off">
        <label>Assessment
          <select name="assessment">
            <option value="">All</option>
            ${opt(assessments, f.assessment)}
          </select>
        </label>
        <label>Status
          <select name="status">
            <option value="">All</option>
            ${opt(statuses, f.status)}
          </select>
        </label>
        <label>Seller
          <select name="seller_type">
            <option value="">All</option>
            ${opt(sellers, f.seller_type)}
          </select>
        </label>
        <label>Max mi away
          <input type="number" name="max_distance" min="0" step="50" placeholder="any" value="${escapeHtml(f.max_distance)}" />
        </label>
        <label>Max miles
          <input type="number" name="max_miles" min="0" step="1000" placeholder="any" value="${escapeHtml(f.max_miles)}" />
        </label>
        <label>Min year
          <input type="number" name="min_year" min="2010" max="2030" placeholder="any" value="${escapeHtml(f.min_year)}" />
        </label>
        <label class="check-label">
          <input type="checkbox" name="favorites_only" ${f.favorites_only ? "checked" : ""} /> Favorites
        </label>
        <label class="check-label" title="${overCount} listings above ${money(budget)}">
          <input type="checkbox" name="include_over_budget" ${f.include_over_budget ? "checked" : ""} /> Include over budget
        </label>
        <label class="grow">Search
          <input type="search" name="q" placeholder="make, model, VIN, location…" value="${escapeHtml(f.q)}" />
        </label>
        <button type="button" class="btn-ghost" id="mp-clear-filters">Clear</button>
      </form>`;
  }

  function renderListRow(c, budget) {
    const { money, miles, escapeHtml } = MartinData;
    const title = displayTitle(c);
    const chip = assessmentChip(c.assessment);
    const fav = MartinData.isFavorite(c.id);
    const selected = state.selectedId === c.id ? "selected" : "";
    const over = isOverBudget(c, budget);
    const dist = c.distance_mi != null ? `${c.distance_mi} mi` : "—";
    const src = photoUrl(c);
    const ph = initialsPlaceholder(c);
    const thumb = src
      ? `<span class="mp-thumb"><img src="${escapeHtml(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" /></span>`
      : `<span class="mp-thumb placeholder"><span>${escapeHtml(ph.mono)}</span></span>`;
    const save =
      c.estimated_savings != null
        ? `<span class="save-chip">~${money(c.estimated_savings)} under</span>`
        : "";
    const cat = resolveCategory(c);
    const makeModel = [c.make, c.model].filter(Boolean).join(" ");
    const privBadge = isPrivate(c.seller_type) ? `<span class="badge private-badge">Private</span>` : "";
    const overBadge = over ? `<span class="badge over-budget-badge">Over budget</span>` : "";
    const deadClass = DEADISH.has(c.status) ? "is-dead" : "";
    return `
      <button type="button" class="mp-row mp-row-card ${selected} ${over ? "is-over-budget" : ""} ${deadClass}" data-id="${escapeHtml(c.id)}">
        ${thumb}
        <span class="mp-row-main">
          <span class="mp-row-title">${fav ? "★ " : ""}${escapeHtml(title)}</span>
          <span class="mp-row-sub">${escapeHtml(c.location || "—")} · ${escapeHtml(c.seller_type || "—")} · ${escapeHtml(dist)}${c.geo_tier != null ? ` · geo ${escapeHtml(String(c.geo_tier))}` : ""}${makeModel ? ` · ${escapeHtml(makeModel)}` : ""}</span>
          <span class="mp-row-mv">
            <span class="badge category-chip ${categoryChipClass(cat)}">${escapeHtml(categoryLabel(cat))}</span>
            ${privBadge}
            ${overBadge}
            ${marketValueHtml(c)} ${save}
          </span>
        </span>
        <span class="mp-row-meta">
          <span class="mp-row-price">${money(c.ask_price)}</span>
          <span class="mp-row-miles">${miles(c.miles)}</span>
          <span class="badge ${chip} deal-badge">${escapeHtml(c.assessment || "")}</span>
          <span class="status-pill">${escapeHtml(c.status || "")}</span>
        </span>
      </button>`;
  }

  function renderPhotoGallery(c) {
    const { escapeHtml } = MartinData;
    const photos = allPhotos(c);
    if (!photos.length) {
      const ph = initialsPlaceholder(c);
      return `<div class="photo-gallery empty">
        <div class="photo-hero placeholder"><span>${escapeHtml(ph.mono)}</span><small>${escapeHtml(ph.label)}</small></div>
        <p class="muted tiny">Photos pending — Maggie backfill in progress for some Strong/Best listings.</p>
      </div>`;
    }
    const hero = photos[0];
    const strip = photos
      .slice(0, 12)
      .map(
        (p, i) =>
          `<button type="button" class="photo-strip-item ${i === 0 ? "active" : ""}" data-full="${escapeHtml(p)}"><img src="${escapeHtml(p)}" alt="" loading="lazy" referrerpolicy="no-referrer" /></button>`
      )
      .join("");
    return `<div class="photo-gallery">
      <div class="photo-hero"><img id="mp-hero-img" src="${escapeHtml(hero)}" alt="${escapeHtml(displayTitle(c))}" referrerpolicy="no-referrer" /></div>
      <div class="photo-strip">${strip}</div>
    </div>`;
  }

  function renderDetail(c, watchlist, budget) {
    const { money, miles, escapeHtml, formatTs, formatDate } = MartinData;
    if (!c) {
      return `<div class="detail-empty"><p class="empty-state">Select a candidate to see photos, notes, price history, and deal context.</p></div>`;
    }
    const title = displayTitle(c);
    const chip = assessmentChip(c.assessment);
    const fav = MartinData.isFavorite(c.id);
    const spark = sparklineSvg(c.price_history);
    const url = c.url
      ? `<a class="btn-primary" href="${escapeHtml(c.url)}" target="_blank" rel="noopener">Open listing ↗</a>`
      : "";
    const save =
      c.estimated_savings != null
        ? `<div class="save-lg">Est. savings ${money(c.estimated_savings)}</div>`
        : "";
    const cat = resolveCategory(c);
    const over = isOverBudget(c, budget);
    const privBadge = isPrivate(c.seller_type) ? `<span class="badge private-badge">Private</span>` : "";
    const overBadge = over ? `<span class="badge over-budget-badge">Over budget</span>` : "";

    const why = c.why_interesting
      ? `<section class="detail-section why"><h4>Why interesting</h4><p class="notes-body">${escapeHtml(c.why_interesting)}</p></section>`
      : "";
    const concerns = c.concerns
      ? `<section class="detail-section concerns"><h4>Concerns</h4><p class="notes-body">${escapeHtml(typeof c.concerns === "string" ? c.concerns : JSON.stringify(c.concerns))}</p></section>`
      : "";

    return `
      <div class="detail-pane ${over ? "is-over-budget" : ""}" data-detail-id="${escapeHtml(c.id)}">
        ${renderPhotoGallery(c)}
        <div class="detail-header">
          <div>
            <h3>${escapeHtml(title)}</h3>
            <div class="detail-sub">
              <span class="badge ${chip} deal-badge">${escapeHtml(c.assessment || "")}</span>
              <span class="badge category-chip ${categoryChipClass(cat)}">${escapeHtml(categoryLabel(cat))}</span>
              ${privBadge}
              ${overBadge}
              <span class="status-pill">${escapeHtml(c.status || "")}</span>
              <span>${escapeHtml(c.seller_type || "—")}</span>
              <span>${escapeHtml(c.location || "—")}</span>
              ${c.geo_tier != null ? `<span>geo tier ${escapeHtml(String(c.geo_tier))}</span>` : ""}
            </div>
          </div>
          <div class="detail-actions">
            <button type="button" class="btn-fav ${fav ? "on" : ""}" id="mp-fav-toggle" aria-pressed="${fav}">
              ${fav ? "★ Favorited" : "☆ Favorite"}
            </button>
            ${url}
          </div>
        </div>
        <div class="detail-price-row">
          <div>
            <div class="price-lg">${money(c.ask_price)}</div>
            <div class="muted">ask · est ${money(c.real_price_est)} · budget ${money(budget)}</div>
            ${save}
            <div class="mv-detail">${marketValueHtml(c)}</div>
          </div>
          <div>${miles(c.miles)} · ${c.distance_mi != null ? escapeHtml(String(c.distance_mi)) + " mi away" : "distance —"}</div>
          ${spark ? `<div class="spark-wrap" title="Price history">${spark}</div>` : ""}
        </div>
        ${medianHint(c, watchlist)}
        <dl class="detail-grid">
          <div><dt>Make</dt><dd>${escapeHtml(c.make || "—")}</dd></div>
          <div><dt>Model</dt><dd>${escapeHtml(c.model || "—")}</dd></div>
          <div><dt>Category</dt><dd>${escapeHtml(categoryLabel(cat))}${c.category ? "" : " <span class=\"muted\">(inferred)</span>"}</dd></div>
          <div><dt>VIN</dt><dd>${escapeHtml(c.vin || "—")}</dd></div>
          <div><dt>Title</dt><dd>${escapeHtml(c.title_status || "—")}</dd></div>
          <div><dt>Drivetrain</dt><dd>${escapeHtml(c.drivetrain || "—")}</dd></div>
          <div><dt>Battery</dt><dd>${escapeHtml(c.battery || "—")}</dd></div>
          <div><dt>EPA range (new)</dt><dd>${escapeHtml(c.epa_range_when_new || "—")}</dd></div>
          <div><dt>Source</dt><dd>${escapeHtml(c.source || "—")}</dd></div>
          <div><dt>First seen</dt><dd>${escapeHtml(formatDate(c.first_seen) || formatTs(c.first_seen))}</dd></div>
          <div><dt>Last seen</dt><dd>${escapeHtml(formatDate(c.last_seen) || formatTs(c.last_seen))}</dd></div>
          <div class="span-2"><dt>ID</dt><dd><code>${escapeHtml(c.id)}</code></dd></div>
        </dl>
        ${why}
        ${concerns}
        <section class="detail-section">
          <h4>Notes</h4>
          <p class="notes-body">${escapeHtml(c.notes || "No notes.")}</p>
        </section>
        <section class="detail-section">
          <h4>Price history</h4>
          ${priceHistoryList(c.price_history)}
        </section>
        <p class="fav-hint muted">Favorites persist in localStorage for this browser (MVP).</p>
      </div>`;
  }

  function findCandidate(data, id) {
    if (!id || !data.watchlist) return null;
    return (data.watchlist.candidates || []).find((c) => c.id === id) || null;
  }

  function bindEvents(data, budget) {
    const form = document.getElementById("mp-filters");
    if (form) {
      const applyFromForm = () => {
        const fd = new FormData(form);
        state.filters.assessment = String(fd.get("assessment") || "");
        state.filters.status = String(fd.get("status") || "");
        state.filters.seller_type = String(fd.get("seller_type") || "");
        state.filters.max_distance = String(fd.get("max_distance") || "");
        state.filters.max_miles = String(fd.get("max_miles") || "");
        state.filters.min_year = String(fd.get("min_year") || "");
        state.filters.favorites_only = form.querySelector('[name="favorites_only"]').checked;
        const overEl = form.querySelector('[name="include_over_budget"]');
        state.filters.include_over_budget = overEl ? overEl.checked : false;
        state.filters.q = String(fd.get("q") || "");
        paint(data);
      };
      form.addEventListener("change", applyFromForm);
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        applyFromForm();
      });
      let t = null;
      const q = form.querySelector('[name="q"]');
      if (q) {
        q.addEventListener("input", () => {
          clearTimeout(t);
          t = setTimeout(applyFromForm, 180);
        });
      }
    }
    const clearBtn = document.getElementById("mp-clear-filters");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        state.filters = {
          assessment: "",
          status: "",
          seller_type: "",
          category: "all",
          max_distance: "",
          max_miles: "",
          min_year: "",
          favorites_only: false,
          include_over_budget: false,
          q: "",
        };
        paint(data);
      });
    }

    document.querySelectorAll(".cat-filter-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.filters.category = btn.getAttribute("data-category") || "all";
        paint(data);
      });
    });

    document.querySelectorAll(".mp-row").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        state.selectedId = id;
        location.hash = "#/marketplace/" + encodeURIComponent(id);
      });
    });

    const favBtn = document.getElementById("mp-fav-toggle");
    if (favBtn && state.selectedId) {
      favBtn.addEventListener("click", () => {
        MartinData.toggleFavorite(state.selectedId);
        paint(data);
      });
    }

    document.querySelectorAll(".photo-strip-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        const full = btn.getAttribute("data-full");
        const hero = document.getElementById("mp-hero-img");
        if (hero && full) hero.src = full;
        document.querySelectorAll(".photo-strip-item").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
      });
    });
  }

  function paint(data) {
    const root = document.getElementById("marketplace-module-body");
    if (!root) return;
    const wl = data.watchlist;
    if (!wl) {
      root.innerHTML = `<p class="empty-state">Watchlist missing from dist/data/marketplace/watchlist.json</p>`;
      return;
    }
    const budget = budgetCap(wl);
    const all = Array.isArray(wl.candidates) ? wl.candidates : [];
    const filtered = sortCandidates(applyFilters(all, budget), budget);
    const inBudgetCount = all.filter((c) => !isOverBudget(c, budget)).length;

    let selected = findCandidate(data, state.selectedId);

    const missingFavNote =
      state.selectedId && !selected
        ? `<div class="detail-pane"><p class="empty-state">Listing <code>${MartinData.escapeHtml(state.selectedId)}</code> is missing from watchlist${
            MartinData.isFavorite(state.selectedId) ? " (kept as favorite until cleared)." : "."
          }</p></div>`
        : "";

    root.innerHTML = `
      ${renderRunCoverage(data.dailyHunt)}
      ${renderFilters(all, budget)}
      <div class="mp-layout">
        <div class="mp-list-pane">
          <div class="mp-list-header">
            <strong>${filtered.length}</strong> of ${all.length} candidates
            · budget ${MartinData.money(budget)}
            · ${inBudgetCount} ≤ budget
            · ranked deal quality · private first
            · <a href="#/">← Home</a>
          </div>
          <div class="mp-list" role="list">
            ${
              filtered.length
                ? filtered.map((c) => renderListRow(c, budget)).join("")
                : `<p class="empty-state">No candidates match these filters.</p>`
            }
          </div>
        </div>
        <div class="mp-detail-pane" id="mp-detail">
          ${missingFavNote || renderDetail(selected, wl, budget)}
        </div>
      </div>`;

    bindEvents(data, budget);
  }

  function render(data, route) {
    const idPart = route && route.parts && route.parts[1] ? decodeURIComponent(route.parts[1]) : null;
    state.selectedId = idPart || null;
    const lead = document.querySelector("#view-marketplace > .lead");
    if (lead) {
      lead.textContent =
        "Vehicle deals from Maggie — EVs, Hyundai/Mazda/Toyota SUVs, and Mach-E when it fits. $21k max · Las Vegas focus · private-party weighted. Favorites stay in localStorage.";
    }
    paint(data);
  }

  global.MarketplaceModule = {
    render,
    state,
    sortCandidates,
    resolveCategory,
    budgetCap,
    PRODUCT_BUDGET,
    isOverBudget,
    displayTitle,
  };
})(window);
