/* Shared data loading + formatting helpers */
(function (global) {
  const DATA = {
    watchlist: null,
    dailyHunt: null,
    favorites: null,
    lastDiff: null,
    progress: null,
    feed: null,
    sessionsIndex: null,
    sessions: {},
    loadedAt: null,
  };

  const FAV_LS_KEY = "martin-dashboard-favorites";

  async function fetchJson(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`${path} → ${res.status}`);
    return res.json();
  }

  async function fetchJsonOptional(path) {
    try {
      return await fetchJson(path);
    } catch (err) {
      console.warn("Optional data missing:", path, err.message);
      return null;
    }
  }

  function readFavoritesLs() {
    try {
      const raw = localStorage.getItem(FAV_LS_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.items)) return null;
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function writeFavoritesLs(fav) {
    try {
      localStorage.setItem(FAV_LS_KEY, JSON.stringify(fav));
    } catch (err) {
      console.warn("Could not persist favorites to localStorage:", err.message);
    }
  }

  /**
   * Merge seed favorites.json with localStorage overlay.
   * Interactive toggles write localStorage only (static SPA, no backend).
   * Build/ingest can later merge LS export into favorites.json.
   */
  function mergeFavorites(seed) {
    const base = seed && Array.isArray(seed.items)
      ? { updated_at: seed.updated_at || null, items: seed.items.slice() }
      : { updated_at: null, items: [] };
    const ls = readFavoritesLs();
    if (!ls) return base;
    // localStorage wins as the interactive SoT for MVP
    return {
      updated_at: ls.updated_at || base.updated_at,
      items: Array.isArray(ls.items) ? ls.items.slice() : [],
      _source: "localStorage",
    };
  }

  function isFavorite(listingId) {
    const fav = DATA.favorites || { items: [] };
    return (fav.items || []).some((i) => i.listing_id === listingId);
  }

  function toggleFavorite(listingId, note) {
    const fav = DATA.favorites || { updated_at: null, items: [] };
    const items = Array.isArray(fav.items) ? fav.items.slice() : [];
    const idx = items.findIndex((i) => i.listing_id === listingId);
    const now = new Date().toISOString();
    if (idx >= 0) {
      items.splice(idx, 1);
    } else {
      items.push({
        listing_id: listingId,
        saved_at: now,
        note: note || "",
      });
    }
    const next = { updated_at: now, items, _source: "localStorage" };
    DATA.favorites = next;
    writeFavoritesLs(next);
    return next;
  }

  async function loadSessions(index) {
    const map = {};
    const ids = (index && Array.isArray(index.session_ids) ? index.session_ids : []) || [];
    await Promise.all(
      ids.map(async (id) => {
        const path = `data/systems-training/sessions/${encodeURIComponent(id)}.json`;
        map[id] = await fetchJsonOptional(path);
      })
    );
    return map;
  }

  async function loadAll() {
    const [watchlist, dailyHunt, favoritesSeed, lastDiff, progress, feed, sessionsIndex] =
      await Promise.all([
        fetchJson("data/marketplace/watchlist.json"),
        fetchJsonOptional("data/marketplace/daily_hunt.json"),
        fetchJsonOptional("data/marketplace/favorites.json"),
        fetchJsonOptional("data/marketplace/last_diff.json"),
        fetchJsonOptional("data/systems-training/progress.json"),
        fetchJsonOptional("data/dashboard_feed.json"),
        fetchJsonOptional("data/systems-training/sessions_index.json"),
      ]);
    DATA.watchlist = watchlist;
    DATA.dailyHunt = dailyHunt;
    DATA.favorites = mergeFavorites(favoritesSeed);
    DATA.lastDiff = lastDiff;
    DATA.progress = progress;
    DATA.feed = feed || { updated_at: null, items: [] };
    DATA.sessionsIndex = sessionsIndex || { updated_at: null, session_ids: [] };
    DATA.sessions = await loadSessions(DATA.sessionsIndex);
    DATA.loadedAt = new Date().toISOString();
    return DATA;
  }

  function money(n) {
    if (n == null || Number.isNaN(Number(n))) return "—";
    return "$" + Number(n).toLocaleString("en-US");
  }

  function miles(n) {
    if (n == null || Number.isNaN(Number(n))) return "—";
    return Number(n).toLocaleString("en-US") + " mi";
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function parseTs(s) {
    if (!s) return null;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function formatTs(s) {
    const d = parseTs(s);
    if (!d) return "—";
    try {
      return (
        d.toLocaleString("en-US", {
          timeZone: "America/Los_Angeles",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }) + " PT"
      );
    } catch (_) {
      return s;
    }
  }

  function formatDate(s) {
    if (!s) return "—";
    // Already a date-only string like 2026-09-21
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = parseTs(s);
    if (!d) return String(s);
    try {
      return d.toLocaleDateString("en-US", {
        timeZone: "America/Los_Angeles",
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch (_) {
      return String(s);
    }
  }

  function maxTs(values) {
    let best = null;
    for (const v of values) {
      const d = parseTs(v);
      if (!d) continue;
      if (!best || d > best) best = d;
    }
    return best;
  }

  function hoursAgo(d) {
    if (!d) return null;
    return (Date.now() - d.getTime()) / 3600000;
  }

  global.MartinData = {
    DATA,
    FAV_LS_KEY,
    loadAll,
    fetchJson,
    fetchJsonOptional,
    mergeFavorites,
    isFavorite,
    toggleFavorite,
    money,
    miles,
    escapeHtml,
    parseTs,
    formatTs,
    formatDate,
    maxTs,
    hoursAgo,
  };
})(window);
