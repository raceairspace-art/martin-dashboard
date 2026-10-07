/* Marketplace Home strip — Best Current vehicle deals ($21k, private-weighted) */
(function (global) {
  const ACTIVE = new Set(["active", "active_possibly_stale"]);
  const DEAL = new Set(["EXCEPTIONAL DEAL", "STRONG DEAL"]);
  const EXCLUDED_STATUS = new Set(["over_budget", "rejected"]);
  const PRODUCT_BUDGET = 21000;

  function budgetCap(watchlist) {
    const fromWl = Number(watchlist && watchlist.max_purchase_price);
    if (!Number.isNaN(fromWl) && fromWl > 0) return Math.min(fromWl, PRODUCT_BUDGET);
    return PRODUCT_BUDGET;
  }

  function isPrivate(seller) {
    const s = String(seller || "").toLowerCase();
    return s === "private" || s.startsWith("private");
  }

  function assessmentChip(assessment) {
    if (assessment === "EXCEPTIONAL DEAL") return "exceptional";
    if (assessment === "STRONG DEAL") return "strong";
    return "fair";
  }

  function resolveCategory(c) {
    if (global.MarketplaceModule && typeof MarketplaceModule.resolveCategory === "function") {
      return MarketplaceModule.resolveCategory(c);
    }
    const raw = c && c.category != null ? String(c.category).trim() : "";
    if (raw) return raw;
    const make = c && c.make ? String(c.make) : "";
    const model = c && c.model ? String(c.model) : "";
    if (make || model) {
      const hay = (make + " " + model).toLowerCase();
      if (/mach[\s\-]?e\b|mustang\s+mach|mach-e/.test(hay)) return "mach_e";
      return "other";
    }
    const hay = [c && c.title, c && c.trim, c && c.notes, c && c.id]
      .map((x) => String(x || "").toLowerCase())
      .join(" ");
    if (/mach[\s\-]?e\b|mustang\s+mach|mach-e/.test(hay)) return "mach_e";
    if (c && c.vin && /^3FMT/i.test(String(c.vin))) return "mach_e";
    return "other";
  }

  function categoryLabel(cat) {
    const map = {
      ev: "EVs",
      mach_e: "Mach-E",
      suv_hyundai: "Hyundai SUVs",
      suv_mazda: "Mazda SUVs",
      suv_toyota: "Toyota SUVs",
      other: "Other",
    };
    return map[cat] || "Unknown";
  }

  function displayTitle(c) {
    if (global.MarketplaceModule && typeof MarketplaceModule.displayTitle === "function") {
      return MarketplaceModule.displayTitle(c);
    }
    const year = c.year != null ? String(c.year) : "";
    const make = c.make ? String(c.make).trim() : "";
    const model = c.model ? String(c.model).trim() : "";
    const trim = c.trim ? String(c.trim).trim() : "";
    if (make || model) return [year, make, model, trim].filter(Boolean).join(" ").trim();
    const cat = resolveCategory(c);
    if (cat === "mach_e" && (year || trim)) return [year, "Mach-E", trim].filter(Boolean).join(" ").trim();
    return [year, trim].filter(Boolean).join(" ").trim() || c.id;
  }

  function geoPreferScore(c) {
    if (c.geo_tier != null && c.geo_tier !== "") {
      const t = Number(c.geo_tier);
      if (!Number.isNaN(t)) return t;
    }
    const loc = String(c.location || "").toLowerCase();
    if (/\blas vegas\b|\bhenderson\b|\bmesquite\b|\bnevada\b|\bnv\b/.test(loc)) return 1;
    return 9;
  }

  function photoUrl(c) {
    const photos = c && c.photos;
    if (Array.isArray(photos) && photos.length && typeof photos[0] === "string" && photos[0]) {
      return photos[0];
    }
    return null;
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

  function bestCurrent(watchlist) {
    const budget = budgetCap(watchlist);
    const candidates = Array.isArray(watchlist.candidates) ? watchlist.candidates : [];
    const pool = candidates.filter(
      (c) =>
        ACTIVE.has(c.status) &&
        DEAL.has(c.assessment) &&
        !EXCLUDED_STATUS.has(c.status)
    );
    const within = pool.filter((c) => Number(c.ask_price) <= budget);
    const use = within.length ? within : pool;
    return use
      .slice()
      .sort((a, b) => {
        const rankA = a.assessment === "EXCEPTIONAL DEAL" ? 0 : 1;
        const rankB = b.assessment === "EXCEPTIONAL DEAL" ? 0 : 1;
        if (rankA !== rankB) return rankA - rankB;
        const privA = isPrivate(a.seller_type) ? 0 : 1;
        const privB = isPrivate(b.seller_type) ? 0 : 1;
        if (privA !== privB) return privA - privB;
        const prA = a.priority_rank != null ? Number(a.priority_rank) : null;
        const prB = b.priority_rank != null ? Number(b.priority_rank) : null;
        if (prA != null && !Number.isNaN(prA) && prB != null && !Number.isNaN(prB) && prA !== prB) {
          return prA - prB;
        }
        if (prA != null && !Number.isNaN(prA) && (prB == null || Number.isNaN(prB))) return -1;
        if (prB != null && !Number.isNaN(prB) && (prA == null || Number.isNaN(prA))) return 1;
        const savA = a.estimated_savings != null ? Number(a.estimated_savings) : null;
        const savB = b.estimated_savings != null ? Number(b.estimated_savings) : null;
        if (savA != null && savB != null && savA !== savB) return savB - savA;
        if (savA != null && savB == null) return -1;
        if (savA == null && savB != null) return 1;
        const priceA = a.ask_price != null ? Number(a.ask_price) : 999999;
        const priceB = b.ask_price != null ? Number(b.ask_price) : 999999;
        if (priceA !== priceB) return priceA - priceB;
        const ga = geoPreferScore(a);
        const gb = geoPreferScore(b);
        if (ga !== gb) return ga - gb;
        const distA = a.distance_mi != null ? Number(a.distance_mi) : 999999;
        const distB = b.distance_mi != null ? Number(b.distance_mi) : 999999;
        return distA - distB;
      })
      .slice(0, 5);
  }

  function countActiveInBudget(watchlist) {
    const budget = budgetCap(watchlist);
    return (watchlist.candidates || []).filter(
      (c) =>
        ACTIVE.has(c.status) &&
        !EXCLUDED_STATUS.has(c.status) &&
        Number(c.ask_price) <= budget
    ).length;
  }

  function exceptionalPrivate(watchlist) {
    return (watchlist.candidates || []).filter(
      (c) =>
        ACTIVE.has(c.status) &&
        c.assessment === "EXCEPTIONAL DEAL" &&
        isPrivate(c.seller_type)
    );
  }

  function huntCounts(daily, lastDiff) {
    const out = {
      newStrong: null,
      priceDrops: null,
      soldRemoved: null,
      quiet: null,
      alertLead: null,
      source: "placeholder",
    };
    if (daily) {
      out.newStrong = Array.isArray(daily.new_strong_deals) ? daily.new_strong_deals.length : 0;
      out.priceDrops = Array.isArray(daily.price_drops) ? daily.price_drops.length : 0;
      const sold = daily.sold_removed || daily.sold_or_removed || daily.sold || [];
      out.soldRemoved = Array.isArray(sold) ? sold.length : 0;
      out.quiet = !!daily.quiet;
      out.alertLead = daily.alert_lead || null;
      out.source = "daily_hunt";
      return out;
    }
    if (lastDiff && lastDiff.counts) {
      out.newStrong = lastDiff.counts.new_strong_or_exceptional ?? 0;
      out.priceDrops = lastDiff.counts.price_drops ?? 0;
      out.soldRemoved = lastDiff.counts.sold_or_removed ?? 0;
      out.source = "last_diff";
      return out;
    }
    out.newStrong = 0;
    out.priceDrops = 0;
    out.soldRemoved = 0;
    out.source = "placeholder";
    return out;
  }

  function renderListingCard(c) {
    const { money, miles, escapeHtml } = MartinData;
    const title = displayTitle(c);
    const chip = assessmentChip(c.assessment);
    const dist = c.distance_mi != null ? `${c.distance_mi} mi` : "dist —";
    const detailHref = `#/marketplace/${encodeURIComponent(c.id)}`;
    const listing = c.url
      ? `<a href="${escapeHtml(c.url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Listing ↗</a>`
      : "";
    const src = photoUrl(c);
    const ph = initialsPlaceholder(c);
    const thumb = src
      ? `<div class="card-thumb"><img src="${escapeHtml(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" /></div>`
      : `<div class="card-thumb placeholder" title="${escapeHtml(ph.label)}"><span>${escapeHtml(ph.mono)}</span></div>`;
    const mv =
      c.market_value_low != null && c.market_value_high != null
        ? `<div class="sub">Mkt ${money(c.market_value_low)}–${money(c.market_value_high)}</div>`
        : `<div class="sub muted">Market value: pending</div>`;
    const save =
      c.estimated_savings != null
        ? `<span class="save-chip">Save ~${money(c.estimated_savings)}</span>`
        : "";
    const cat = resolveCategory(c);
    const privBadge = isPrivate(c.seller_type)
      ? `<span class="badge private-badge">Private</span>`
      : "";
    return `
      <a class="listing-card has-thumb" href="${escapeHtml(detailHref)}" data-id="${escapeHtml(c.id)}">
        ${thumb}
        <div class="card-body">
          <p class="title">${escapeHtml(title)}</p>
          <div class="price">${money(c.ask_price)} ${save}</div>
          ${mv}
          <div class="sub">${miles(c.miles)} · ${escapeHtml(c.seller_type || "—")} · ${escapeHtml(dist)}${c.fuel ? ` · ${escapeHtml(String(c.fuel))}` : ""}</div>
          <div class="chip-row">
            <span class="badge ${chip}">${escapeHtml(c.assessment || "")}</span>
            <span class="badge category-chip">${escapeHtml(categoryLabel(cat))}</span>
            ${privBadge}
            ${listing}
          </div>
        </div>
      </a>`;
  }

  function renderHomeStrip(data) {
    const { money, escapeHtml, parseTs, hoursAgo } = MartinData;
    const el = document.getElementById("marketplace-strip-body");
    if (!el) return { banner: null };

    const wl = data.watchlist;
    if (!wl) {
      el.innerHTML = `<p class="empty-state">Watchlist not available.</p>`;
      return { banner: null };
    }

    const budget = budgetCap(wl);
    const activeBudget = countActiveInBudget(wl);
    const best = bestCurrent(wl);
    const counts = huntCounts(data.dailyHunt, data.lastDiff);
    const staleHrs = hoursAgo(parseTs(wl.updated_at));
    const staleHint =
      staleHrs != null && staleHrs > 36
        ? `<span class="badge stale">Stale data (${Math.round(staleHrs)}h)</span>`
        : "";

    const quietNote =
      counts.quiet && !exceptionalPrivate(wl).length
        ? `<span class="badge quiet">No material market changes</span>`
        : "";

    const cards =
      best.length === 0
        ? `<p class="empty-state">No active Strong/Exceptional deals in budget right now.</p>`
        : `<div class="cards cards-thumbs">${best.map(renderListingCard).join("")}</div>`;

    const countNote =
      counts.source === "placeholder" ? " · <em>NEW/drops/sold pending ingest</em>" : "";

    el.innerHTML = `
      <div class="strip-meta">
        <span>Budget: <strong>${money(budget)}</strong> · Vehicle deals · LV focus</span>
        <span><strong>${activeBudget}</strong> active ≤ budget</span>
        ${staleHint}
        ${quietNote}
      </div>
      <div class="stat-row">
        <span>NEW Strong/Exceptional: <strong>${counts.newStrong}</strong></span>
        <span>Price drops: <strong>${counts.priceDrops}</strong></span>
        <span>Sold/removed: <strong>${counts.soldRemoved}</strong>${countNote}</span>
      </div>
      <p class="strip-line"><span class="label">Best Current</span> · <a href="#/marketplace">Browse all →</a></p>
      ${cards}
    `;

    const exc = exceptionalPrivate(wl);
    if (exc.length) {
      const top = exc[0];
      return {
        banner: {
          priority: 1,
          severity: "critical",
          title: "Exceptional private-party deal",
          summary: `${displayTitle(top)} · ${money(top.ask_price)} · ${top.location || ""}`,
          ctaLabel: "Open in Marketplace",
          ctaHref: `#/marketplace/${encodeURIComponent(top.id)}`,
          entityId: top.id,
        },
      };
    }
    return { banner: null, bestCount: best.length, counts };
  }

  global.MarketplaceHome = {
    bestCurrent,
    countActiveInBudget,
    exceptionalPrivate,
    huntCounts,
    photoUrl,
    initialsPlaceholder,
    budgetCap,
    PRODUCT_BUDGET,
    resolveCategory,
    displayTitle,
    renderHomeStrip,
  };
})(window);
