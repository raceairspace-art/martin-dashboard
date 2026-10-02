/* Martin Dashboard shell — hash router + Home orchestration */
(function () {
  function parseRoute() {
    const raw = (location.hash || "#/").replace(/^#/, "") || "/";
    const path = raw.startsWith("/") ? raw : "/" + raw;
    const parts = path.split("/").filter(Boolean);
    return { path: "/" + parts.join("/"), parts };
  }

  function setActiveNav(routePath) {
    document.querySelectorAll(".app-header nav a").forEach((a) => {
      const r = a.getAttribute("data-route");
      const active =
        r === "/"
          ? routePath === "/" || routePath === ""
          : routePath === r || routePath.startsWith(r + "/");
      a.classList.toggle("active", active);
    });
  }

  function showView(id) {
    ["view-home", "view-marketplace", "view-training"].forEach((vid) => {
      const el = document.getElementById(vid);
      if (el) el.classList.toggle("hidden", vid !== id);
    });
  }

  function renderBanner(banner) {
    const el = document.getElementById("global-banner");
    if (!el) return;
    if (!banner) {
      el.className = "banner hidden";
      el.innerHTML = "";
      return;
    }
    const { escapeHtml } = MartinData;
    el.className = `banner ${banner.severity || "medium"}`;
    const cta = banner.ctaHref
      ? `<a class="banner-cta" href="${escapeHtml(banner.ctaHref)}">${escapeHtml(banner.ctaLabel || "Open")}</a>`
      : "";
    el.innerHTML = `
      <div class="banner-body">
        <p class="banner-title">${escapeHtml(banner.title)}</p>
        <p class="banner-summary">${escapeHtml(banner.summary || "")}</p>
      </div>
      ${cta}`;
  }

  function renderFeed(feed) {
    const el = document.getElementById("feed-list");
    if (!el) return;
    const items = (feed && feed.items ? feed.items : [])
      .filter((i) => !i.dismissed)
      .slice()
      .sort((a, b) => {
        const ta = MartinData.parseTs(a.ts);
        const tb = MartinData.parseTs(b.ts);
        return (tb ? tb.getTime() : 0) - (ta ? ta.getTime() : 0);
      })
      .slice(0, 10);

    if (!items.length) {
      el.innerHTML = `<li class="empty-state">No alerts yet. Marketplace ingest will populate this feed.</li>`;
      return;
    }

    const { escapeHtml, formatTs } = MartinData;
    el.innerHTML = items
      .map((item) => {
        const cta =
          item.cta && item.cta.route
            ? `<a href="${escapeHtml(item.cta.route)}">${escapeHtml(item.cta.label || "Open")}</a>`
            : "";
        return `
        <li class="feed-item">
          <span class="feed-sev ${escapeHtml(item.severity || "info")}" title="${escapeHtml(item.severity || "")}"></span>
          <div>
            <p class="feed-title">${escapeHtml(item.title)}</p>
            <p class="feed-summary">${escapeHtml(item.summary || "")} ${cta}</p>
          </div>
          <div class="feed-meta">${formatTs(item.ts)}</div>
        </li>`;
      })
      .join("");
  }

  function pickBanner(marketResult, trainResult) {
    const candidates = [marketResult && marketResult.banner, trainResult && trainResult.banner]
      .filter(Boolean)
      .sort((a, b) => (a.priority || 99) - (b.priority || 99));
    return candidates[0] || null;
  }

  function updateFreshness(data) {
    const el = document.getElementById("global-updated");
    if (!el) return;
    const best = MartinData.maxTs([
      data.watchlist && data.watchlist.updated_at,
      data.dailyHunt && data.dailyHunt.run_at,
      data.progress && data.progress.updated_at,
      data.feed && data.feed.updated_at,
    ]);
    el.textContent = best
      ? "Updated " + MartinData.formatTs(best.toISOString())
      : "Updated —";
  }

  let cache = null;

  function renderHome() {
    if (!cache) return;
    const market = MarketplaceHome.renderHomeStrip(cache);
    const train = TrainingHome.renderHomeStrip(cache);
    renderBanner(pickBanner(market, train));
    renderFeed(cache.feed);
    updateFreshness(cache);
  }

  function renderRoute() {
    const route = parseRoute();
    const root = route.parts[0] || "";
    setActiveNav(root ? "/" + root : "/");
    if (!root) {
      showView("view-home");
      renderHome();
      return;
    }
    if (root === "marketplace") {
      showView("view-marketplace");
      if (cache && globalThis.MarketplaceModule) MarketplaceModule.render(cache, route);
      updateFreshness(cache || {});
      return;
    }
    if (root === "training") {
      showView("view-training");
      if (cache && globalThis.TrainingModule) TrainingModule.render(cache, route);
      updateFreshness(cache || {});
      return;
    }
    showView("view-home");
    renderHome();
  }

  async function boot() {
    try {
      cache = await MartinData.loadAll();
    } catch (err) {
      console.error(err);
      const m = document.getElementById("marketplace-strip-body");
      const t = document.getElementById("training-strip-body");
      if (m) {
        m.innerHTML = `<p class="empty-state">Failed to load data: ${MartinData.escapeHtml(err.message)}. Serve from <code>dist/</code> via http.server.</p>`;
      }
      if (t) t.innerHTML = `<p class="empty-state">Data load failed.</p>`;
      return;
    }
    renderRoute();
  }

  window.addEventListener("hashchange", renderRoute);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
