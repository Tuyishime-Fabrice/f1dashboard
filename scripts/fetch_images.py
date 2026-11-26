#!/usr/bin/env python3
"""Collect openly licensed Formula 1 images from Wikimedia Commons.

For every driver / constructor / circuit in scope the script:
  1. resolves the entity's English Wikipedia article (URL from the dataset, or a
     Wikipedia search when the dataset has no URL);
  2. takes the article's lead image, then the other images on the article, and
     finally a Wikimedia Commons file search as candidates;
  3. keeps only files hosted on Commons whose licence is CC0, public domain,
     CC BY or CC BY-SA (non-free / fair-use files are rejected);
  4. downloads a thumbnail into ``frontend/public/images/<kind>/`` and records
     source URL, author, licence and attribution in ``credits.json``.

Usage:
    python scripts/fetch_images.py                 # default scope
    python scripts/fetch_images.py --kinds drivers --force
    python scripts/fetch_images.py --dry-run

Scope: drivers who started a race since 2010, all world champions and the top
50 race winners; constructors that raced since 2010 plus the 25 most successful;
every circuit. Wikimedia API etiquette is followed: a descriptive User-Agent,
sequential requests, batched metadata queries and a small delay between calls.
"""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import sys
import time
import unicodedata
import urllib.parse
from datetime import date
from pathlib import Path

import duckdb
import httpx

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "backend" / "data" / "raw"
OUT = ROOT / "frontend" / "public" / "images"
CREDITS = OUT / "credits.json"

WIKI_API = "https://en.wikipedia.org/w/api.php"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
# Wikimedia's User-Agent policy asks for contact details. Set PITWALL_WIKIMEDIA_CONTACT
# (an e-mail address or project URL) to include them; without it a generic UA is
# sent and Wikimedia may rate-limit the script heavily.
_CONTACT = os.environ.get("PITWALL_WIKIMEDIA_CONTACT", "").strip()
USER_AGENT = f"PitwallF1Analytics/1.0 (image credit collection script{'; ' + _CONTACT if _CONTACT else ''}) httpx"
MAX_CONSECUTIVE_429 = 6  # stop cleanly (progress is saved) when Wikimedia keeps refusing
DELAY = 3.0  # seconds between API calls (Wikimedia rate limits unauthenticated clients)

# Wikimedia serves a fixed set of standard thumbnail widths.
WIDTH = {"drivers": 500, "constructors": 960, "circuits": 960, "hero": 1920}
FREE_LICENSE = re.compile(r"^(cc0|cc[- ]by(-sa)?([- ]\d(\.\d)?)?|public domain|pd\b|pd-|no restrictions)", re.I)
PORTRAIT_HINT = re.compile(r"(portrait|headshot|\(cropped\)|_cropped|press_conference|interview)", re.I)
SKIP_FILE = re.compile(
    r"(flag|logo_of|icon|symbol|helmet|signature|coat_of_arms|map_of|location|locator|commons-logo|wiki|"
    r"edit-clear|question_book|ambox|portal|\.svg\.png$)", re.I)


# --------------------------------------------------------------------------- http
class RateLimited(RuntimeError):
    pass


class Client:
    def __init__(self) -> None:
        self.http = httpx.Client(headers={"User-Agent": USER_AGENT}, timeout=30, follow_redirects=True)
        self.refusals = 0

    def _wait(self, r: httpx.Response, attempt: int) -> None:
        if r.status_code == 429:
            self.refusals += 1
            if self.refusals >= MAX_CONSECUTIVE_429:
                raise RateLimited("Wikimedia keeps answering HTTP 429; progress saved - re-run later "
                                  "(and set PITWALL_WIKIMEDIA_CONTACT).")
        retry = r.headers.get("retry-after", "")
        pause = int(retry) if retry.isdigit() else 15 * 2 ** attempt
        print(f"    (HTTP {r.status_code}, backing off {pause}s)")
        time.sleep(min(pause, 900))  # honour Retry-After

    def get(self, url: str, params: dict) -> dict:
        for attempt in range(6):
            try:
                time.sleep(DELAY)
                r = self.http.get(url, params={**params, "format": "json", "formatversion": "2"})
                if r.status_code == 429 or r.status_code >= 500:
                    self._wait(r, attempt)
                    continue
                r.raise_for_status()
                self.refusals = 0
                return r.json()
            except httpx.HTTPError:
                time.sleep(2 ** attempt)
        raise RuntimeError(f"Request failed: {url} {params}")

    def download(self, url: str, dest: Path) -> int:
        for attempt in range(6):
            time.sleep(DELAY / 2)
            r = self.http.get(url)
            if r.status_code == 429 or r.status_code >= 500:
                self._wait(r, attempt)
                continue
            r.raise_for_status()
            self.refusals = 0
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(r.content)
            return len(r.content)
        raise RuntimeError(f"Download failed: {url}")


# --------------------------------------------------------------------------- scope
def load_scope(con: duckdb.DuckDBPyConnection) -> dict[str, list[dict]]:
    def csv(name: str) -> str:
        return f"read_csv('{(RAW / name).as_posix()}', header=true, nullstr='\\N', sample_size=-1)"

    con.execute(f"CREATE VIEW races AS SELECT * FROM {csv('races.csv')}")
    con.execute(f"CREATE VIEW results AS SELECT * FROM {csv('results.csv')}")
    con.execute(f"CREATE VIEW drivers AS SELECT * FROM {csv('drivers.csv')}")
    con.execute(f"CREATE VIEW constructors AS SELECT * FROM {csv('constructors.csv')}")
    con.execute(f"CREATE VIEW circuits AS SELECT * FROM {csv('circuits.csv')}")
    con.execute(f"CREATE VIEW ds AS SELECT * FROM {csv('driver_standings.csv')}")

    def q(sql: str) -> list[dict]:
        res = con.execute(sql)
        cols = [c[0] for c in res.description]
        return [dict(zip(cols, r)) for r in res.fetchall()]

    drivers = q("""
      WITH recent AS (SELECT DISTINCT driverId FROM results JOIN races USING (raceId) WHERE year >= 2010),
      wins AS (SELECT driverId, count(DISTINCT raceId) w FROM results WHERE position = 1 GROUP BY 1),
      top_winners AS (SELECT driverId FROM wins ORDER BY w DESC LIMIT 50),
      last_race AS (SELECT year, max_by(raceId, round) AS raceId FROM races GROUP BY year),
      champs AS (SELECT DISTINCT ds.driverId FROM ds JOIN last_race USING (raceId) WHERE ds.position = 1)
      SELECT d.driverRef AS ref, d.forename || ' ' || d.surname AS name, d.surname, d.url
      FROM drivers d
      LEFT JOIN (SELECT driverId, max(year) AS last_year FROM results JOIN races USING (raceId) GROUP BY 1) ly USING (driverId)
      WHERE driverId IN (SELECT * FROM recent UNION SELECT * FROM top_winners UNION SELECT * FROM champs)
      ORDER BY ly.last_year DESC, d.driverId""")
    constructors = q("""
      WITH recent AS (SELECT DISTINCT constructorId FROM results JOIN races USING (raceId) WHERE year >= 2010),
      top AS (SELECT constructorId FROM results WHERE position = 1 GROUP BY 1 ORDER BY count(DISTINCT raceId) DESC LIMIT 25)
      SELECT constructorRef AS ref, name, name AS surname, url FROM constructors c
      LEFT JOIN (SELECT constructorId, max(year) AS last_year FROM results JOIN races USING (raceId) GROUP BY 1) ly USING (constructorId)
      WHERE constructorId IN (SELECT * FROM recent UNION SELECT * FROM top) ORDER BY ly.last_year DESC, constructorId""")
    circuits = q("SELECT circuitRef AS ref, name, name AS surname, url FROM circuits ORDER BY circuitId")
    return {"drivers": drivers, "constructors": constructors, "circuits": circuits}


# --------------------------------------------------------------------------- helpers
def ascii_fold(text: str) -> str:
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()


def title_from_url(url: str | None) -> str | None:
    if not url or "/wiki/" not in url:
        return None
    raw = url.split("/wiki/", 1)[1].split("#", 1)[0]
    return urllib.parse.unquote(raw).replace("_", " ")


def strip_html(text: str | None) -> str | None:
    if not text:
        return None
    clean = re.sub(r"<[^>]+>", "", text)
    return re.sub(r"\s+", " ", html.unescape(clean)).strip() or None


def resolve_titles(client: Client, titles: list[str]) -> dict[str, dict]:
    """Batch-resolve article titles -> {lead image name, list of image names}."""
    out: dict[str, dict] = {}
    for i in range(0, len(titles), 40):
        batch = titles[i:i + 40]
        data = client.get(WIKI_API, {"action": "query", "titles": "|".join(batch), "redirects": 1,
                                     "prop": "pageimages", "piprop": "name"})
        q = data.get("query", {})
        alias = {n["from"]: n["to"] for n in q.get("normalized", [])}
        alias.update({r["from"]: r["to"] for r in q.get("redirects", [])})
        pages = {p["title"]: p for p in q.get("pages", [])}
        for t in batch:
            final = t
            for _ in range(3):
                final = alias.get(final, final)
            page = pages.get(final)
            if page and not page.get("missing"):
                out[t] = {"title": final, "lead": page.get("pageimage")}
    return out


def article_images(client: Client, title: str) -> list[str]:
    data = client.get(WIKI_API, {"action": "query", "titles": title, "prop": "images", "imlimit": 50})
    pages = data.get("query", {}).get("pages", [])
    return [im["title"].split(":", 1)[1] for p in pages for im in p.get("images", [])]


def search_article(client: Client, query: str) -> str | None:
    data = client.get(WIKI_API, {"action": "query", "list": "search", "srsearch": query, "srlimit": 3})
    hits = data.get("query", {}).get("search", [])
    return hits[0]["title"] if hits else None


def commons_search(client: Client, query: str, limit: int = 8) -> list[str]:
    data = client.get(COMMONS_API, {"action": "query", "list": "search", "srsearch": f"{query} filetype:bitmap",
                                    "srnamespace": 6, "srlimit": limit})
    return [h["title"].split(":", 1)[1] for h in data.get("query", {}).get("search", [])]


def thumb_url(ii: dict, width: int) -> str:
    """Standard Wikimedia thumbnail URL for the original file (or the original if smaller)."""
    url = ii["url"].split("?", 1)[0]
    if ii.get("width", 0) <= width and not url.lower().endswith(".svg"):
        return url
    prefix = "https://upload.wikimedia.org/wikipedia/commons/"
    if not url.startswith(prefix):
        return url
    rest = url[len(prefix):]
    name = rest.rsplit("/", 1)[1]
    suffix = ".png" if name.lower().endswith(".svg") else ""
    return f"{prefix}thumb/{rest}/{width}px-{name}{suffix}"


def commons_info(client: Client, files: list[str], width: int) -> dict[str, dict]:
    """Licence + thumbnail metadata for files hosted on Commons (others are absent)."""
    out: dict[str, dict] = {}
    for i in range(0, len(files), 40):
        batch = files[i:i + 40]
        data = client.get(COMMONS_API, {
            "action": "query", "titles": "|".join(f"File:{f}" for f in batch), "prop": "imageinfo",
            "iiprop": "url|extmetadata|mime|size",
            "iiextmetadatafilter": "LicenseShortName|LicenseUrl|Artist|Credit|AttributionRequired|NonFree|"
                                   "UsageTerms|ImageDescription|Restrictions",
        })
        q = data.get("query", {})
        alias = {n["to"]: n["from"] for n in q.get("normalized", [])}
        for p in q.get("pages", []):
            if p.get("missing") or not p.get("imageinfo"):
                continue
            ii = p["imageinfo"][0]
            meta = {k: v.get("value") for k, v in (ii.get("extmetadata") or {}).items()}
            name = alias.get(p["title"], p["title"]).split(":", 1)[1]
            ii["thumburl"] = thumb_url(ii, width)
            out[name] = {"info": ii, "meta": meta, "title": p["title"]}
    return out


def acceptable(entry: dict, kind: str) -> bool:
    meta, ii = entry["meta"], entry["info"]
    lic = (meta.get("LicenseShortName") or "").strip()
    if str(meta.get("NonFree", "")).lower() in ("true", "1") or not FREE_LICENSE.match(lic):
        return False
    if meta.get("Restrictions") and "trademark" not in str(meta["Restrictions"]).lower():
        return False
    mime = ii.get("mime", "")
    if kind in ("drivers", "hero") and mime not in ("image/jpeg", "image/png", "image/webp"):
        return False
    if kind == "hero" and ii.get("width", 0) < 1600:
        return False
    return bool(ii.get("thumburl"))


def credit_record(entry: dict, local: str, method: str, article: str | None) -> dict:
    meta, ii = entry["meta"], entry["info"]
    return {
        "file": local,
        "title": entry["title"],
        "source_url": ii.get("descriptionurl"),
        "image_url": ii.get("thumburl"),
        "author": strip_html(meta.get("Artist")) or "Unknown author",
        "credit": strip_html(meta.get("Credit")),
        "license": meta.get("LicenseShortName"),
        "license_url": meta.get("LicenseUrl"),
        "attribution_required": str(meta.get("AttributionRequired", "")).lower() == "true",
        "wikipedia_article": article,
        "method": method,
        "retrieved": date.today().isoformat(),
    }


def name_match(file: str, entity: dict, kind: str) -> bool:
    f = ascii_fold(file)
    if kind == "drivers":
        return ascii_fold(entity["surname"]) in f
    if kind == "circuits":
        words = [w for w in re.findall(r"[a-z]{4,}", ascii_fold(entity["name"]))
                 if w not in ("circuit", "international", "autodromo", "grand", "prix", "street", "park", "racing")]
        return any(w in f for w in words)
    return ascii_fold(entity["name"]).split()[0] in f


# --------------------------------------------------------------------------- main
def collect(client: Client, kind: str, entities: list[dict], credits: dict, force: bool, dry: bool) -> None:
    store = credits.setdefault(kind, {})
    todo = [e for e in entities if force or e["ref"] not in store]
    print(f"\n[{kind}] {len(todo)} to process ({len(entities) - len(todo)} already credited)")
    for e in todo:
        e["article"] = title_from_url(e.get("url"))
        if not e["article"]:
            suffix = {"drivers": "racing driver", "constructors": "Formula One team", "circuits": "circuit"}[kind]
            e["article"] = search_article(client, f"{e['name']} {suffix}")
    resolved = resolve_titles(client, [e["article"] for e in todo if e["article"]])

    # Pass 1: check every article lead image in batched Commons queries.
    leads = {e["ref"]: resolved.get(e["article"] or "", {}).get("lead") for e in todo}
    lead_info = commons_info(client, sorted({f for f in leads.values() if f}), WIDTH[kind])

    ok = miss = 0
    for e in todo:
        art = resolved.get(e["article"] or "", {})
        lead = leads.get(e["ref"])
        chosen = None
        if lead and lead in lead_info and acceptable(lead_info[lead], kind):
            chosen, entry = (lead, "wikipedia-lead-image"), lead_info[lead]
        else:
            # Pass 2: other images on the article, then a Commons file search.
            candidates: list[tuple[str, str]] = []
            # Drivers: only portrait-like fallbacks (article images are mostly cars on track).
            if art.get("title") and kind != "drivers":
                for f in article_images(client, art["title"]):
                    if f != lead and not SKIP_FILE.search(f) and (kind == "circuits" or name_match(f, e, kind)):
                        candidates.append((f, "wikipedia-article-image"))
            if len(candidates) < 3:
                query = e["name"] + (" Formula One" if kind != "circuits" else "")
                for f in commons_search(client, query if kind != "drivers" else f"{e['name']} portrait", 6):
                    portrait_ok = kind != "drivers" or PORTRAIT_HINT.search(f)
                    if portrait_ok and name_match(f, e, kind) and not SKIP_FILE.search(f) and all(f != c[0] for c in candidates):
                        candidates.append((f, "commons-search"))
            candidates = candidates[:10]
            info = commons_info(client, [c[0] for c in candidates], WIDTH[kind]) if candidates else {}
            for f, m in candidates:
                if f in info and acceptable(info[f], kind):
                    chosen, entry = (f, m), info[f]
                    break
        if not chosen:
            miss += 1
            print(f"  - {e['ref']}: no openly licensed image found")
            continue
        f, method = chosen
        thumb = entry["info"]["thumburl"]
        ext = Path(urllib.parse.urlparse(thumb).path).suffix.lower() or ".jpg"
        ext = ".jpg" if ext == ".jpeg" else ext
        local = f"/images/{kind}/{e['ref']}{ext}"
        try:
            size = 0 if dry else client.download(thumb, OUT / kind / f"{e['ref']}{ext}")
        except (httpx.HTTPError, RuntimeError) as exc:
            miss += 1
            print(f"  - {e['ref']}: download failed ({exc})")
            continue
        store[e["ref"]] = credit_record(entry, local, method, art.get("title"))
        ok += 1
        print(f"  + {e['ref']}: {f} [{store[e['ref']]['license']}] {size // 1024} KB")
        if not dry:
            save(credits)
    print(f"[{kind}] downloaded {ok}, no suitable image for {miss}")


def collect_hero(client: Client, credits: dict, force: bool, dry: bool) -> None:
    if "hero" in credits and not force:
        print("\n[hero] already credited")
        return
    print("\n[hero] searching")
    queries = ["Formula One race start grid", "Formula 1 Grand Prix race start", "Formula One cars racing track"]
    candidates: list[str] = []
    for q in queries:
        candidates += [f for f in commons_search(client, q, 15) if f not in candidates]
    info = commons_info(client, candidates[:30], WIDTH["hero"])
    for f in candidates:
        e = info.get(f)
        if not e or not acceptable(e, "hero"):
            continue
        ii = e["info"]
        if ii["width"] < ii["height"] * 1.4:  # need a wide landscape frame
            continue
        local = "/images/hero/hero.jpg"
        if not dry:
            client.download(ii["thumburl"], OUT / "hero" / "hero.jpg")
        credits["hero"] = {"main": credit_record(e, local, "commons-search", None)}
        print(f"  + hero: {f} [{e['meta'].get('LicenseShortName')}]")
        if not dry:
            save(credits)
        return
    print("  - no suitable hero image")


def save(credits: dict) -> None:
    CREDITS.parent.mkdir(parents=True, exist_ok=True)
    credits["_meta"] = {
        "generated": date.today().isoformat(),
        "source": "Wikimedia Commons (via the MediaWiki API)",
        "policy": "Only files hosted on Commons with CC0, public-domain, CC BY or CC BY-SA licences are used. "
                  "Thumbnails are unmodified apart from resizing by Wikimedia's thumbnailer.",
    }
    CREDITS.write_text(json.dumps(credits, indent=2, ensure_ascii=False, sort_keys=True), encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--kinds", nargs="+", default=["hero", "drivers", "constructors", "circuits"],
                    choices=["hero", "drivers", "constructors", "circuits"])
    ap.add_argument("--force", action="store_true", help="re-fetch entities that already have credits")
    ap.add_argument("--dry-run", action="store_true", help="resolve and print without downloading")
    ap.add_argument("--limit", type=int, default=0, help="process only the first N entities per kind")
    args = ap.parse_args()

    credits = json.loads(CREDITS.read_text(encoding="utf-8")) if CREDITS.exists() else {}
    client = Client()
    scope = load_scope(duckdb.connect())
    try:
        for kind in args.kinds:
            if kind == "hero":
                collect_hero(client, credits, args.force, args.dry_run)
                continue
            ents = scope[kind][: args.limit] if args.limit else scope[kind]
            collect(client, kind, ents, credits, args.force, args.dry_run)
    except RateLimited as exc:
        print(f"\nStopped: {exc}")
        if not args.dry_run:
            save(credits)
        return 2
    if not args.dry_run:
        save(credits)
    return 0


if __name__ == "__main__":
    sys.exit(main())
