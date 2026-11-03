# Weather (#/weather + Home widget)

Requested by GoodWeatherGordon. Las Vegas-area wind & weather for low-wind activities, window **Nov 3–9, 2026**.

## Inputs
1. **Open-Meteo forecast** (no key), fetched at build time by `scripts/fetch_weather.py`:
   hourly `wind_speed_10m`, `wind_gusts_10m` (mph), `wind_direction_10m`, `temperature_2m` (°F),
   `precipitation_probability`, `weather_code`, plus daily high/low, timezone America/Los_Angeles.
   Locations (since Nov 3, Gordon's change): **Las Vegas** (36.170, -115.140) · **Lake Mead (Boulder Beach)**
   (36.031, -114.798, lake) · **Desert Breeze Park** (Spring Valley RC field, 36.123, -115.272, RC field) ·
   **Brian Head, UT** (37.70, -112.85, fetched at `elevation=2957` m ≈ 9,700 ft so temps/wind are mountain values;
   other spots send `nan` = Open-Meteo's own terrain height). For Brian Head (`snow: true`) we also pull
   hourly `snowfall` + `snow_depth` and daily `snowfall_sum` (`precipitation_unit=inch`; Open-Meteo returns
   snow depth in ft, converted to inches). **Snowfall** = daily total (in), **Snow depth** = max daytime model depth (in),
   "—" when Open-Meteo has none.
   Lake Las Vegas and Lake Mohave (Cottonwood Cove) were removed from the page; they stay in the config catalog.
2. **Gordon's headline file**: `/workspace/weather/low-wind-YYYY-MM-DD.json` (newest date in the file name wins;
   **read-only**, never modified). Supplies the headline rating per day (BEST | GOOD | MARGINAL | NO-GO), label,
   note, his wind/gust/highs ranges (shown verbatim), `all_days`, `top_picks` and `locations`. Per-location
   blocks named by the config's `gordon_key` (`brian_head`: wind, gust, diff, high/low, snowfall_in, low_wind,
   skiing, skiing_note) are copied verbatim to `days[].gordon_locations`, and the top-level note named by
   `gordon_info` (`brian_head_info`) goes to `gordon.info`.
3. **`config/weather_locations.json`**: the location list. Gordon's `locations` (names) decides which spots are
   shown and in what order. Names are matched case-insensitively against `name` or `aliases`. If his file has no
   `locations` field, the config's `default` list is used. Coordinates and flags (`lake`, `rc_field`) always come
   from the config. A name the config doesn't know is still shown, but its card reads "—" (it has no coordinates, so it isn't fetched) and the build logs a warning:
   add it to `catalog` with lat/lon. `forecast.json` records `locations_source` (`gordon` | `config`).

## Refresh (Gordon refreshes ~6am PT daily through Nov 9)
1. Gordon drops the new `/workspace/weather/low-wind-YYYY-MM-DD.json`.
2. `bash scripts/build_dist.sh` (runs `fetch_weather.py`, writes `data/weather/forecast.json`, copies it to `dist/`).
3. Commit to `main` (`data/weather/forecast.json` + `dist/`), then publish `dist/` to `gh-pages` (normal push).

Env: `WEATHER_NO_FETCH=1` skips Open-Meteo (Gordon-only); `WEATHER_SRC` overrides the Gordon folder;
`WEATHER_START` / `WEATHER_END` override the window (default: the dates in Gordon's file, else today + 6 days).

## What is computed (per location, per day)
Daytime = **7am–5pm PT** (hours 07:00–17:00 inclusive).
- **Wind** = max daytime sustained wind; also `sustained_avg`.
- **Gusts** = max daytime gust. **Gust diff** = max gust − max sustained (floored at 0).
- **Direction** = speed-weighted mean daytime direction (where the wind comes FROM; the arrow points downwind).
- **Rain** = max daytime precipitation probability. **High/Low** = daily max/min. Condition = most frequent daytime weather code.
- **Low wind qualifies**: sustained ≤ 8 mph **and** gust diff < 10 mph.
- Hourly daytime wind/gust bars (mini chart on each card).

## Activity ratings (derived; thresholds in mph and % rain)
A day gets the first tier whose limits are all met, otherwise NO-GO. Any missing input ⇒ rating "—".

| Activity | BEST | GOOD | MARGINAL |
|---|---|---|---|
| General outdoors | wind ≤ 8, gust ≤ 15, rain ≤ 10% | wind ≤ 15, gust ≤ 25, rain ≤ 30% | wind ≤ 20, gust ≤ 30, rain ≤ 60% |
| Lake (boating, paddling, PWC) | wind ≤ 5, gust ≤ 10, rain ≤ 20% | wind ≤ 10, gust ≤ 15, rain ≤ 30% | wind ≤ 15, gust ≤ 20, rain ≤ 50% |
| Drones | wind ≤ 5, gust ≤ 10, diff ≤ 6, rain ≤ 10% | wind ≤ 10, gust ≤ 15, diff < 10, rain ≤ 20% | wind ≤ 15, gust ≤ 20, rain ≤ 40% |
| RC airplanes | wind ≤ 5, diff ≤ 5, rain ≤ 10% | wind ≤ 8, diff < 10 (= low-wind rule), rain ≤ 20% | wind ≤ 12, gust ≤ 18, rain ≤ 30% |
| Paramotoring | wind ≤ 5, gust ≤ 8, diff ≤ 4, rain ≤ 10% | wind ≤ 8, gust ≤ 12, diff ≤ 6, rain ≤ 10% | wind ≤ 10, gust ≤ 15, diff < 10, rain ≤ 20% |

| Skiing (snow spots only) | new snow ≥ 4″ **and** snow depth ≥ 24″ | new snow ≥ 1″ **or** snow depth ≥ 12″ | — | less / no snow |

**Skiing** is the 6th activity. It applies only to locations with `"skiing": true` in `config/weather_locations.json`
(Brian Head now); every other location shows a grey **N/A** chip. Rating order: **Gordon's per-day `skiing` value
first** (as-is, his `skiing_note` under the chip and as its tooltip); otherwise derived from Open-Meteo snowfall
(daily total, in) and snow depth (max daytime, in) with the thresholds above (`SKI` in `fetch_weather.py`);
unknown snow ⇒ "—". Each location-day carries `ratings.skiing`, `skiing_source` (`gordon` | `derived`) and
`skiing_derived`. This week Gordon rates Brian Head NO-GO every day.

Thresholds live in `ACTIVITIES` / `SKI` in `scripts/fetch_weather.py` and are published in the JSON, so the page legend
always matches. **Gordon's headline rating is shown as-is** and is never recomputed.

## Display
- `#/weather`: hero with "Updated" time (forecast fetch, PT) and Gordon's issue date, Top picks bar (Gordon's ranked
  dates), one card per day (past days hidden client-side by PT date) with Gordon's headline chip/label/ranges/note and
  one location card per configured spot (4 now) (icon, high/low, wind, gusts, gust diff, direction arrow, rain, gust gauge with the 8 mph
  limit, hourly bars, five activity chips), then a definitions/thresholds legend.
- Home widget: Today + Tomorrow for Las Vegas (icon, high/low, wind/gusts + arrow) with flags: **Outdoors**
  (Las Vegas outdoors rating), **Lake** (lake rating of the `lake` spots, now Lake Mead only, lake named),
  **Low-wind flying** (Gordon's headline rating; falls back to the derived RC rating at the `rc_field` spot, Desert
  Breeze Park, or Las Vegas if there is none). The footer line reflects this ("lake = Lake Mead · flying = Gordon's
  headline (else Desert Breeze Park RC)"). Under each day's flags is a compact line per snow spot:
  "Brian Head: ski [Gordon's skiing chip] · snow N″" (Open-Meteo snowfall, else Gordon's). Links to `#/weather`.
- Brian Head card: the usual card plus a Snowfall / Snow depth row, a "Gordon" line with his numbers verbatim,
  his **low_wind YES/NO shown as-is** in the low-wind pill (instead of the computed one), a **Skiing** chip with
  his rating and `skiing_note` as-is, and `brian_head_info` as a note at the bottom. Skiing is never computed by us.
- **Activity filter** row (All + the six activities, remembered in localStorage): highlights that activity's row
  on every card, dims the others, and adds a "Skiing: [best chip] Brian Head"-style badge to each day.
- **Best days by activity** (under Gordon's top picks): per activity, the days reaching that week's best computed
  rating if GOOD or better, else "no good days this week". **Gordon's top picks are never changed by this.**
- Chips: N/A grey = activity doesn't apply here. BEST green, GOOD teal, MARGINAL amber (dark text), NO-GO red, "—" grey = unknown.

## Failure behaviour
If Open-Meteo fails, `forecast.json` has `source: "gordon-only"`, `updated_at: null`, `fetch_error`, and every
location entry is `null`: the page shows a notice plus Gordon's headline ratings and ranges; per-location numbers
show "—". Nothing is estimated. If Gordon's file is missing, days show "No headline from Gordon".
The step never fails the build.

## Files
`scripts/fetch_weather.py` · `config/weather_locations.json` · `data/weather/forecast.json` · `modules/weather/module.js` (WeatherModule,
WeatherHome) · CSS block "Weather" in `app/css/styles.css` · wiring in `app/index.html`, `app/js/app.js`, `app/js/data.js`,
`scripts/build_dist.sh`.

## Cache-busting
`build_dist.sh` (last step) versions every css/js tag in `dist/index.html` with `?v=<md5 of the file>`, and stamps a
build id (hash of all dist files) into `<meta name="martin-build">` and `window.MARTIN_BUILD`, which `app/js/data.js`
appends as `?v=` to every JSON fetch (also `cache: "no-store"`). `index.html` carries no-cache meta tags.
GitHub Pages still serves index.html with its own short HTTP cache (about 10 minutes); the meta tags and versioned URLs
make sure that a normal refresh then loads the new assets and data. Mirrored Black Friday images aren't versioned.
