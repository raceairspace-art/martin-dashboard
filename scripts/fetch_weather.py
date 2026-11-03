#!/usr/bin/env python3
"""Weather for the Martin Dashboard (#/weather + Home widget).

Pulls Open-Meteo hourly + daily forecasts for the Las Vegas-area spots in Gordon's "locations" list
(fallback: config/weather_locations.json `default`), computes daytime
(7am-5pm PT) wind numbers per day, derives activity ratings from documented thresholds,
and overlays GoodWeatherGordon's headline file (/workspace/weather/low-wind-YYYY-MM-DD.json,
newest wins, read-only). Writes data/weather/forecast.json.

Never invents numbers: anything we could not get is null (shown as "—").
If Open-Meteo fails, the page falls back to Gordon's headline ratings only.
Always exits 0 (build_dist.sh treats weather as optional).
"""
import json, os, re, sys, urllib.parse, urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "weather" / "forecast.json"
GORDON_DIR = Path(os.environ.get("WEATHER_SRC", "/workspace/weather"))
TZ = "America/Los_Angeles"
DAY_START, DAY_END = 7, 17          # daytime window: 07:00 .. 17:00 PT inclusive
LOW_WIND_SUSTAINED, LOW_WIND_DIFF = 8, 10   # qualifies: sustained <= 8 AND gust diff < 10

LOC_CONFIG = ROOT / "config" / "weather_locations.json"
LOC_KEYS = ("id", "name", "lat", "lon", "lake", "rc_field")


def norm_name(s):
    return re.sub(r"\s+", " ", str(s or "")).strip().lower()


def resolve_locations(gordon):
    """Locations to show, in order: Gordon's "locations" names if present, else config `default`.
    Coordinates and flags always come from config/weather_locations.json. A name Gordon lists that
    the config doesn't know is kept (shown as "—") but not fetched, since there are no coordinates."""
    cfg = json.loads(LOC_CONFIG.read_text())
    cat = cfg["catalog"]
    by_id = {c["id"]: c for c in cat}
    by_name = {}
    for c in cat:
        for n in [c["name"], *c.get("aliases", [])]:
            by_name.setdefault(norm_name(n), c)
    names = (gordon or {}).get("locations")
    out, src, unknown = [], "config", []
    if isinstance(names, list) and any(isinstance(n, str) and n.strip() for n in names):
        src = "gordon"
        for n in names:
            if not isinstance(n, str) or not n.strip():
                continue
            c = by_name.get(norm_name(n))
            if c is None:
                unknown.append(n)
                slug = re.sub(r"[^a-z0-9]+", "_", norm_name(n)).strip("_") or "loc"
                c = {"id": slug, "name": n.strip(), "lat": None, "lon": None, "lake": False, "rc_field": False}
            if all(o["id"] != c["id"] for o in out):
                out.append(c)
    else:
        out = [by_id[i] for i in cfg["default"] if i in by_id]
    return [{k: c.get(k, False if k in ("lake", "rc_field") else None) for k in LOC_KEYS} for c in out], src, unknown


LOCATIONS = []  # set in main() via resolve_locations()

# Activity thresholds (all mph / %). A day gets the first tier whose limits it meets; else NO-GO.
# sustained = max daytime sustained wind, gust = max daytime gust, diff = gust - sustained,
# rain = max daytime precipitation probability. Missing input -> rating null ("—").
ACTIVITIES = [
    {"id": "outdoors", "name": "General outdoors", "tiers": [
        ("BEST", {"sustained": 8, "gust": 15, "rain": 10}),
        ("GOOD", {"sustained": 15, "gust": 25, "rain": 30}),
        ("MARGINAL", {"sustained": 20, "gust": 30, "rain": 60})]},
    {"id": "lake", "name": "Lake (boating, paddling, PWC)", "tiers": [
        ("BEST", {"sustained": 5, "gust": 10, "rain": 20}),
        ("GOOD", {"sustained": 10, "gust": 15, "rain": 30}),
        ("MARGINAL", {"sustained": 15, "gust": 20, "rain": 50})]},
    {"id": "drones", "name": "Drones", "tiers": [
        ("BEST", {"sustained": 5, "gust": 10, "diff": 6, "rain": 10}),
        ("GOOD", {"sustained": 10, "gust": 15, "diff": 10, "rain": 20}),
        ("MARGINAL", {"sustained": 15, "gust": 20, "rain": 40})]},
    {"id": "rc", "name": "RC airplanes", "tiers": [
        ("BEST", {"sustained": 5, "diff": 5, "rain": 10}),
        ("GOOD", {"sustained": 8, "diff": 9.99, "rain": 20}),
        ("MARGINAL", {"sustained": 12, "gust": 18, "rain": 30})]},
    {"id": "paramotor", "name": "Paramotoring", "tiers": [
        ("BEST", {"sustained": 5, "gust": 8, "diff": 4, "rain": 10}),
        ("GOOD", {"sustained": 8, "gust": 12, "diff": 6, "rain": 10}),
        ("MARGINAL", {"sustained": 10, "gust": 15, "diff": 9.99, "rain": 20})]},
]

WMO = {0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Rime fog",
       51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 56: "Freezing drizzle", 57: "Freezing drizzle",
       61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Freezing rain",
       71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains", 80: "Showers", 81: "Showers",
       82: "Heavy showers", 85: "Snow showers", 86: "Snow showers", 95: "Thunderstorm",
       96: "Thunderstorm, hail", 99: "Thunderstorm, hail"}


def rate(m, tiers):
    for name, lim in tiers:
        vals = {k: m.get(k) for k in lim}
        if any(v is None for v in vals.values()):
            return None
        if all(vals[k] <= lim[k] for k in lim):
            return name
    return "NO-GO"


def rnd(x, n=0):
    return None if x is None else (round(x) if n == 0 else round(x, n))


def mean_dir(dirs, speeds):
    import math
    pairs = [(d, s) for d, s in zip(dirs, speeds) if d is not None and s is not None]
    if not pairs:
        return None
    x = sum(math.sin(math.radians(d)) * max(s, 0.1) for d, s in pairs)
    y = sum(math.cos(math.radians(d)) * max(s, 0.1) for d, s in pairs)
    return round((math.degrees(math.atan2(x, y)) + 360) % 360)


def load_gordon():
    best = None
    for p in sorted(GORDON_DIR.glob("low-wind-*.json")) if GORDON_DIR.is_dir() else []:
        m = re.match(r"^low-wind-(\d{4}-\d{2}-\d{2})\.json$", p.name)
        if m and (best is None or m.group(1) > best[0]):
            best = (m.group(1), p)
    if not best:
        return None, None
    try:
        return json.loads(best[1].read_text()), best[1].name
    except (OSError, json.JSONDecodeError) as e:
        print(f"  WARNING: could not read {best[1].name}: {e}")
        return None, best[1].name


def fetch(start, end, locs):
    q = {
        "latitude": ",".join(str(l["lat"]) for l in locs),
        "longitude": ",".join(str(l["lon"]) for l in locs),
        "hourly": "wind_speed_10m,wind_gusts_10m,wind_direction_10m,temperature_2m,precipitation_probability,weather_code",
        "daily": "temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max",
        "wind_speed_unit": "mph", "temperature_unit": "fahrenheit", "timezone": TZ,
        "start_date": start, "end_date": end,
    }
    url = "https://api.open-meteo.com/v1/forecast?" + urllib.parse.urlencode(q)
    req = urllib.request.Request(url, headers={"User-Agent": "MartinDashboard/1.0 (personal weather page)"})
    with urllib.request.urlopen(req, timeout=20) as r:
        data = json.loads(r.read())
    return data if isinstance(data, list) else [data]


def day_metrics(h, d, i_day, day):
    idx = [i for i, t in enumerate(h["time"]) if t.startswith(day) and DAY_START <= int(t[11:13]) <= DAY_END]
    pick = lambda k: [h[k][i] for i in idx if h[k][i] is not None]
    ws, wg = pick("wind_speed_10m"), pick("wind_gusts_10m")
    rain = pick("precipitation_probability")
    temps = pick("temperature_2m")
    codes = pick("weather_code")
    sustained = max(ws) if ws else None
    gust = max(wg) if wg else None
    m = {
        "sustained": rnd(sustained), "sustained_avg": rnd(sum(ws) / len(ws)) if ws else None,
        "gust": rnd(gust),
        # gust diff = max gust - max sustained; clamped at 0 (the model occasionally has gust < sustained)
        "diff": rnd(max(gust - sustained, 0)) if sustained is not None and gust is not None else None,
        "direction": mean_dir([h["wind_direction_10m"][i] for i in idx], [h["wind_speed_10m"][i] for i in idx]),
        "rain": rnd(max(rain)) if rain else None,
        "high": rnd(d["temperature_2m_max"][i_day]), "low": rnd(d["temperature_2m_min"][i_day]),
        "day_temp_max": rnd(max(temps)) if temps else None,
        # most frequent daytime weather code (ties -> the more significant/higher code)
        "code": max(set(codes), key=lambda c: (codes.count(c), c)) if codes else d["weather_code"][i_day],
        "hourly": [{"h": int(h["time"][i][11:13]), "w": rnd(h["wind_speed_10m"][i]), "g": rnd(h["wind_gusts_10m"][i]),
                    "dir": h["wind_direction_10m"][i]} for i in idx],
    }
    m["condition"] = WMO.get(m["code"]) if m["code"] is not None else None
    m["low_wind"] = (None if m["sustained"] is None or m["diff"] is None
                     else bool(m["sustained"] <= LOW_WIND_SUSTAINED and m["diff"] < LOW_WIND_DIFF))
    m["ratings"] = {a["id"]: rate(m, a["tiers"]) for a in ACTIVITIES}
    return m


def main():
    now = datetime.now(ZoneInfo(TZ))
    today = now.date()
    gordon, gordon_file = load_gordon()
    global LOCATIONS
    LOCATIONS, loc_source, loc_unknown = resolve_locations(gordon)
    for n in loc_unknown:
        print(f"  WARNING: Gordon location {n!r} is not in config/weather_locations.json (no coordinates; shown as \"—\")")
    gdays = {d.get("date"): d for d in (gordon or {}).get("days", []) if isinstance(d, dict) and d.get("date")}
    if gdays:
        w_start, w_end = min(gdays), max(gdays)
    else:
        w_start, w_end = today.isoformat(), (today + timedelta(days=6)).isoformat()
    w_start = os.environ.get("WEATHER_START", w_start)
    w_end = os.environ.get("WEATHER_END", w_end)
    start = max(w_start, today.isoformat())
    dates = []
    d0 = date.fromisoformat(start)
    while d0.isoformat() <= w_end:
        dates.append(d0.isoformat()); d0 += timedelta(days=1)

    source, error, per_loc = "open-meteo+gordon", None, {}
    if dates and os.environ.get("WEATHER_NO_FETCH") != "1":
        try:
            geo = [l for l in LOCATIONS if l["lat"] is not None and l["lon"] is not None]
            res = fetch(dates[0], dates[-1], geo) if geo else []
            for loc, r in zip(geo, res):
                h, dd = r["hourly"], r["daily"]
                per_loc[loc["id"]] = {day: day_metrics(h, dd, dd["time"].index(day), day)
                                      for day in dates if day in dd["time"]}
        except Exception as e:  # network, HTTP, schema
            error = f"{type(e).__name__}: {str(e)[:120]}"
            per_loc = {}
    else:
        error = "fetch skipped" if dates else "window is in the past"
    if not per_loc:
        source = "gordon-only" if gordon else "none"
        print(f"  WARNING: Open-Meteo unavailable ({error}); falling back to Gordon's file only")

    days = []
    picks = [p for p in ((gordon or {}).get("top_picks") or {}).get("dates", []) if isinstance(p, str)]
    for day in dates:
        g = gdays.get(day) or {}
        days.append({
            "date": day,
            "headline": {k: g.get(k) for k in ("rating", "label", "note", "wind_mph", "gust_mph", "gust_diff_mph", "highs_f")} if g else None,
            "top_pick_rank": (picks.index(day) + 1) if day in picks else None,
            "locations": {loc["id"]: per_loc.get(loc["id"], {}).get(day) for loc in LOCATIONS},
        })

    doc = {
        "updated_at": now.isoformat(timespec="seconds") if per_loc else None,
        "source": source,
        "fetch_error": error if not per_loc else None,
        "timezone": TZ,
        "window": {"start": w_start, "end": w_end, "daytime": f"{DAY_START:02d}:00-{DAY_END:02d}:00"},
        "low_wind_rule": {"sustained_max": LOW_WIND_SUSTAINED, "gust_diff_lt": LOW_WIND_DIFF},
        "locations": [{k: l[k] for k in LOC_KEYS} for l in LOCATIONS],
        "locations_source": loc_source,
        "activities": [{"id": a["id"], "name": a["name"],
                        "tiers": [{"rating": n, **lim} for n, lim in a["tiers"]]} for a in ACTIVITIES],
        "gordon": None if not gordon else {
            "file": gordon_file, "issued": gordon.get("issued"), "source": gordon.get("source"),
            "window": gordon.get("window"), "definitions": gordon.get("definitions"),
            "all_days": gordon.get("all_days"), "top_picks": gordon.get("top_picks"),
        },
        "days": days,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n")
    lv = [(d["date"][5:], (d["locations"].get("las_vegas") or {}).get("sustained"), (d["locations"].get("las_vegas") or {}).get("gust"),
           (d["headline"] or {}).get("rating")) for d in days]
    print(f"==> Weather locations ({loc_source}): {[l['name'] for l in LOCATIONS]}")
    print(f"==> Weather: {len(days)} day(s) {dates[0] if dates else '-'}..{dates[-1] if dates else '-'}, source={source}, "
          f"Gordon={gordon_file or 'none'}; Las Vegas (day, sust, gust, headline): {lv}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"  WARNING: weather step failed: {type(e).__name__}: {e}")
    sys.exit(0)
