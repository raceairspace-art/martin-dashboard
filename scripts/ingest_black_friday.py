#!/usr/bin/env python3
"""Black Friday 2026 ingest: merge BlackFridayFrank (gear_tech) and Travelin Sam
(travel) sweep files into data/black-friday/deals.json and mirror deal images.

Sources (read-only): $BF_SRC (default /workspace/black-friday-2026)
  gear-tech-sweep-YYYY-MM-DD.json, travel-sweep-YYYY-MM-DD.json
  {section, swept_at, deals:[{item_key, category, subcategory?, item, retailer, price,
   regular_price, discount, deal_status, date_found, source_url, image_url, image_alt?,
   new_release?, notes?}]}

Merge: sweeps are applied oldest→newest by swept_at; the newest sweep that contains an
item_key wins for every field; price_history keeps one {swept_at, price} per sweep.
Prices are copied as given (numbers, or null). Nothing is ever estimated.

Images: https image_url files are mirrored into data/black-friday/img/<sha1>.<ext>
(cache; the build copies them into dist), re-encoded to <=900px WebP when Pillow is present. Polite: 1 request at a time, 1 s apart (3 s for Wikimedia; HTTP 429 backs off up to 2x),
15 s timeout, 8 MB cap, image/* only; cached files are never re-fetched and failures
are retried at most once a day. Any failure → image null → holiday placeholder.
Never fails the build: errors are reported and the script exits 0.

  python3 scripts/ingest_black_friday.py [--src DIR] [--no-fetch]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "data" / "black-friday"
IMG_DIR = OUT_DIR / "img"
IMG_INDEX = OUT_DIR / "img_index.json"
SRC_DEFAULT = os.environ.get("BF_SRC", "/workspace/black-friday-2026")
FILE_RE = re.compile(r"^(gear-tech|travel)-sweep-(\d{4}-\d{2}-\d{2})(?:-(\d{1,2}))?\.json$")
UA = "MartinDashboard/1.0 (personal deals page; image mirror; polite single fetch)"
EXT = {"image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp",
       "image/gif": "gif", "image/avif": "avif", "image/svg+xml": "svg"}
MAX_BYTES = 8 * 1024 * 1024

# ---- section mapping (single source: config/black_friday_sections.json) -----
SECTIONS_FILE = ROOT / "config" / "black_friday_sections.json"


def key(s) -> str:
    """Normalize a category for matching: lowercase, _ separators, no trailing 's'."""
    k = re.sub(r"[^a-z0-9]+", "_", str(s or "").lower()).strip("_")
    return k[:-1] if k.endswith("s") and not k.endswith("ss") else k


norm = key


def load_sections() -> list[dict]:
    return json.loads(SECTIONS_FILE.read_text())["sections"]


def make_classifier(sections: list[dict]):
    fallback = next((s["id"] for s in sections if s.get("fallback")), sections[-1]["id"])
    by_cat = {}
    for s in sections:
        for c in s.get("categories", []):
            by_cat.setdefault(key(c), s)

    def classify(category, subcategory) -> tuple[str, str | None, bool]:
        """→ (section id, subsection id or None, known category?)"""
        c, sc = key(category), key(subcategory)
        sec = by_cat.get(c)
        if not sec:
            return fallback, None, False
        for sub in sec.get("subsections", []):
            m = {key(x) for x in sub.get("match", [])}
            if c in m or (sc and sc in m):
                return sec["id"], sub["id"], True
        return sec["id"], None, True
    return classify


def public_sections(sections: list[dict]) -> list[dict]:
    return [{"id": s["id"], "title": s["title"], "icon": s.get("icon", "gift"),
             "subsections": [{"id": x["id"], "title": x["title"], "icon": x.get("icon")} for x in s.get("subsections", [])]}
            for s in sections]


MONEY = re.compile(r"\$\s?([0-9][0-9,]*(?:\.[0-9]{1,2})?)")


def price_fields(v):
    """Return (price_number_or_None, label_or_None) from an agent-supplied price.
    Numbers pass through. Text keeps the agent's own first $ amount (plus a leading
    "from" / trailing "deposit" qualifier) as the label; nothing is computed or guessed."""
    if v is None or isinstance(v, bool):
        return None, None
    if isinstance(v, (int, float)):
        return (v, None) if v >= 0 else (None, None)
    t = str(v).strip()
    num = clean_price(t)
    if num is not None:
        return num, None
    m = MONEY.search(t)
    if not m:
        return None, None  # e.g. "see item" → "See deal"
    amount = "$" + m.group(1)
    if re.search(r"deposit", t, re.I):
        return None, amount + " deposit"  # a deposit is not the item price
    n = float(m.group(1).replace(",", ""))
    n = int(n) if n.is_integer() else n
    prefix = "from " if re.match(r"^\s*(from|starting at)\b", t, re.I) else ""
    return n, prefix + amount


def clean_price(v):
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return v if v >= 0 else None
    m = re.fullmatch(r"\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*", str(v))
    if m:
        n = float(m.group(1).replace(",", ""))
        return int(n) if n.is_integer() else n
    return None  # unparseable text → treat as no price (UI shows "See deal")


def safe_url(u):
    return u if isinstance(u, str) and re.match(r"^https?://", u) else None


# ---- image mirror --------------------------------------------------------
def shrink(data: bytes, ext: str) -> tuple[bytes, str]:
    """Verify the bytes really are an image and re-encode to <=900px WebP (keeps the page light).
    Without Pillow the original bytes are kept."""
    try:
        from io import BytesIO
        from PIL import Image
    except ImportError:
        return data, ext
    if ext == "svg":
        return data, ext
    im = Image.open(BytesIO(data))
    im.load()  # raises on non-images / truncated files
    if getattr(im, "is_animated", False):
        return data, ext
    im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB")
    im.thumbnail((900, 900))
    buf = BytesIO()
    im.save(buf, "WEBP", quality=80, method=5)
    return (buf.getvalue(), "webp") if buf.tell() < len(data) else (data, ext)


def mirror(url: str, index: dict, fetch: bool, log: list) -> str | None:
    h = hashlib.sha1(url.encode()).hexdigest()[:16]
    for p in IMG_DIR.glob(h + ".*"):
        return p.name
    ent = index.get(url) or {}
    if not fetch:
        return None
    if ent.get("error") and ent.get("tried_at") and "429" not in ent["error"]:  # rate limits are transient: retry next run
        try:
            if datetime.now(timezone.utc) - datetime.fromisoformat(ent["tried_at"]) < timedelta(hours=24):
                log.append(f"  skip (failed <24h ago: {ent['error']}): {url[:90]}")
                return None
        except ValueError:
            pass
    host = urllib.parse.urlparse(url).netloc.lower()
    time.sleep(3.0 if host.endswith("wikimedia.org") else 1.0)  # Wikimedia rate-limits bursts (HTTP 429)
    try:
        # Wikimedia transcodes on the fly when avif/webp is requested and rate-limits that path (429): ask for the original format there.
        accept = "image/*" if host.endswith("wikimedia.org") else "image/avif,image/webp,image/*;q=0.9"
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept})
        for attempt in range(3):  # back off on HTTP 429, honouring Retry-After (capped at 30 s)
            try:
                r = urllib.request.urlopen(req, timeout=15)
                break
            except urllib.error.HTTPError as he:
                if he.code != 429 or attempt == 2:
                    raise
                try:
                    wait = min(float(he.headers.get("Retry-After") or 0), 30.0)
                except ValueError:
                    wait = 0.0
                time.sleep(max(wait, 10.0 * (attempt + 1)))
        with r:
            ctype = (r.headers.get("Content-Type") or "").split(";")[0].strip().lower()
            ext = EXT.get(ctype)
            if not ext:
                raise ValueError(f"not an image ({ctype or 'no content-type'})")
            data = r.read(MAX_BYTES + 1)
            if len(data) > MAX_BYTES:
                raise ValueError("too large")
            if len(data) < 200:
                raise ValueError("too small")
        data, ext = shrink(data, ext)
        name = f"{h}.{ext}"
        (IMG_DIR / name).write_bytes(data)
        index[url] = {"file": name, "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
        log.append(f"  mirrored {name} ({len(data)//1024} KB)")
        return name
    except Exception as e:  # noqa: BLE001 — any failure → placeholder
        msg = f"{type(e).__name__}: {e}"[:160]
        index[url] = {"file": None, "error": msg, "tried_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
        log.append(f"  FAILED ({msg}): {url[:90]}")
        return None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", default=SRC_DEFAULT)
    ap.add_argument("--no-fetch", action="store_true", help="only use already-mirrored images")
    args = ap.parse_args()
    src = Path(args.src)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    IMG_DIR.mkdir(parents=True, exist_ok=True)

    sections = load_sections()
    classify = make_classifier(sections)
    sweeps, warnings = [], []
    for p in sorted(src.glob("*-sweep-*.json")) if src.is_dir() else []:
        m = FILE_RE.match(p.name)
        if not m:
            warnings.append(f"ignored file name: {p.name}")
            continue
        doc, err = None, None
        for attempt in range(6):  # files may be mid-edit by the sweep agent: wait briefly and retry
            try:
                doc = json.loads(p.read_text())
                break
            except (OSError, json.JSONDecodeError) as e:
                err = e
                time.sleep(5)
        if doc is None:
            warnings.append(f"unreadable {p.name} after retries: {err}")
            continue
        exp = "gear_tech" if m.group(1) == "gear-tech" else "travel"
        sec = doc.get("section") or exp
        if sec != exp:
            warnings.append(f"{p.name}: section {sec!r} != file name; using {exp!r}")
            sec = exp
        sweeps.append({"file": p.name, "section": sec, "swept_at": doc.get("swept_at") or m.group(2) + "T00:00:00",
                       "deals": [d for d in doc.get("deals") or [] if isinstance(d, dict)]})
    sweeps.sort(key=lambda s: (s["swept_at"], s["file"]))

    items: dict[str, dict] = {}
    for sw in sweeps:
        seen = set()
        for d in sw["deals"]:
            key_ = str(d.get("item_key") or "").strip()
            if not key_:
                key_ = f"{sw['section']}:{norm(d.get('item'))}"
                warnings.append(f"{sw['file']}: deal without item_key → {key_}")
            if key_ in seen:
                warnings.append(f"{sw['file']}: duplicate item_key {key_} (last one wins)")
            seen.add(key_)
            prev = items.get(key_)
            shelf, sub, known = classify(d.get("category"), d.get("subcategory"))
            if not known:
                warnings.append(f"{sw['file']}: {key_} unknown category {d.get('category')!r} → {shelf}")
            price, price_label = price_fields(d.get("price"))
            if isinstance(d.get("price"), str) and (price_label or price is None):
                warnings.append(f"{sw['file']}: {key_} price is text {d.get('price')!r} → "
                                f"{'label ' + repr(price_label) if price_label else repr(price) if price is not None else 'See deal'}")
            hist = [h for h in (prev or {}).get("price_history", []) if h["swept_at"] != sw["swept_at"]]
            hist.append({"swept_at": sw["swept_at"], "price": price})  # number or null, as swept
            item = {
                "item_key": key_, "section": sw["section"], "shelf": shelf, "sub": sub,
                "category": d.get("category"), "subcategory": d.get("subcategory"),
                "item": str(d.get("item") or "").strip()[:80],
                "retailer": d.get("retailer"), "price": price, "price_label": price_label, "price_raw": d.get("price"), "regular_price": clean_price(d.get("regular_price")),
                "discount": d.get("discount"), "deal_status": d.get("deal_status"),  # as given; only exactly "expired" is hidden
                "date_found": d.get("date_found"), "source_url": safe_url(d.get("source_url")),
                "image_url": d.get("image_url"), "image_alt": d.get("image_alt"),
                "new_release": d.get("new_release") is True, "notes": d.get("notes"),
                "price_history": hist,
                "first_seen": (prev or {}).get("first_seen") or sw["swept_at"], "last_seen": sw["swept_at"],
            }
            if len(item["item"]) > 60:
                warnings.append(f"{sw['file']}: {key_} item text {len(item['item'])} chars (>60)")
            if not item["source_url"]:
                warnings.append(f"{sw['file']}: {key_} has no usable source_url")
            items[key_] = item

    try:
        index = json.loads(IMG_INDEX.read_text()) if IMG_INDEX.is_file() else {}
    except (OSError, json.JSONDecodeError):
        index = {}
    log: list[str] = []
    mirrored = placeholders = 0
    for it in items.values():
        url = it["image_url"]
        name = mirror(url, index, not args.no_fetch, log) if isinstance(url, str) and url.startswith("https://") else None
        if url and not str(url).startswith("https://"):
            log.append(f"  not https, skipped: {str(url)[:90]}")
        it["image"] = f"data/black-friday/img/{name}" if name else None
        mirrored += bool(name)
        placeholders += not name
    used = {Path(it["image"]).name for it in items.values() if it["image"]}
    for p in IMG_DIR.glob("*"):
        if p.name not in used:
            p.unlink()  # drop images no deal references any more
    IMG_INDEX.write_text(json.dumps(index, indent=2, sort_keys=True) + "\n")

    shelf_order = [s["id"] for s in sections]
    out_items = sorted(items.values(), key=lambda i: (shelf_order.index(i["shelf"]), str(i["sub"]), i["item"].lower()))
    doc = {
        "updated_at": max((s["swept_at"] for s in sweeps), default=None),
        "sections": public_sections(sections),
        "sweeps": [{"file": s["file"], "section": s["section"], "swept_at": s["swept_at"], "deals": len(s["deals"])} for s in sweeps],
        "items": out_items,
    }
    (OUT_DIR / "deals.json").write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")

    from collections import Counter
    vis = Counter(i["shelf"] for i in out_items if i["deal_status"] != "expired")
    print(f"==> Black Friday: {len(sweeps)} sweep(s), {len(out_items)} item(s); "
          f"visible (non-expired) per shelf: {dict(vis) or '{}'}; expired: {sum(i['deal_status']=='expired' for i in out_items)}")
    print(f"==> Black Friday images: {mirrored} mirrored, {placeholders} placeholder(s)")
    for line in log:
        print(line)
    for w in warnings:
        print("  note: " + w)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:  # never break the build
        print(f"WARNING: Black Friday ingest failed: {e}", file=sys.stderr)
        sys.exit(0)
