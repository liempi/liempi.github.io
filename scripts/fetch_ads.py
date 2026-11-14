#!/usr/bin/env python3
"""Fetch the publication list from the NASA/ADS API into data/publications.json.

The website reads that JSON file in the browser (assets/js/publications.js), so
the secret ADS token never has to be shipped to visitors.

Usage (locally):
    ADS_API_TOKEN=<your token> python3 scripts/fetch_ads.py

Get a token at https://ui.adsabs.harvard.edu/user/settings/token.
In GitHub the same script runs on a schedule via
.github/workflows/update-publications.yml, using the ADS_API_TOKEN repo secret.

Only the Python standard library is used. If anything goes wrong the existing
data/publications.json is left untouched and the script exits non-zero.
"""

import datetime
import json
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

# ---- Edit these -------------------------------------------------------------
# Same search as the ADS link: author "Liempi, Matias" in astronomy or physics.
QUERY = 'author:"Liempi, Matias"'
FILTER = "database:(astronomy OR physics)"
# Regex (applied to the accent-stripped, lower-cased author string as ADS gives
# it, e.g. "liempi, matias") that identifies *you* in each author list. It is
# used to work out your author position and to highlight your name.
ME = r"^liempi,\s*m"
# Bibcodes to hide (e.g. a paper by someone else with a matching name).
EXCLUDE = set()
# -----------------------------------------------------------------------------

API = "https://api.adsabs.harvard.edu/v1/search/query"
FIELDS = [
    "bibcode", "title", "author", "year", "pubdate", "pub", "volume", "page",
    "doctype", "doi", "identifier", "abstract", "citation_count", "property",
]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "publications.json")


def strip_accents(s):
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def fetch():
    token = os.environ.get("ADS_API_TOKEN", "").strip()
    if not token:
        sys.exit("ADS_API_TOKEN is not set.")
    params = urllib.parse.urlencode({
        "q": QUERY,
        "fq": FILTER,
        "fl": ",".join(FIELDS),
        "sort": "date desc, bibcode desc",
        "rows": 200,
    })
    req = urllib.request.Request(
        API + "?" + params,
        headers={"Authorization": "Bearer " + token, "User-Agent": "personal-website-publications/1.0"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as e:
        sys.exit("ADS API returned HTTP %s: %s" % (e.code, e.read().decode("utf-8", "replace")[:300]))
    except urllib.error.URLError as e:
        sys.exit("Could not reach the ADS API: %s" % e.reason)


def convert(doc):
    authors = doc.get("author") or []
    me = re.compile(ME)
    pos = next((i + 1 for i, a in enumerate(authors) if me.search(strip_accents(a).lower())), None)
    ids = [doc["bibcode"]] + [i for i in (doc.get("identifier") or []) if i != doc["bibcode"]]
    arxiv = next((i.split(":", 1)[1] for i in ids if i.lower().startswith("arxiv:")), None)
    page = (doc.get("page") or [None])[0]
    return {
        "bibcode": doc["bibcode"],
        "title": (doc.get("title") or ["(untitled)"])[0],
        "authors": authors,
        "position": pos,                      # your 1-based place in the author list
        "year": doc.get("year"),
        "pubdate": doc.get("pubdate"),
        "pub": doc.get("pub"),
        "volume": doc.get("volume"),
        "page": page,
        "doctype": doc.get("doctype"),
        "doi": (doc.get("doi") or [None])[0],
        "arxiv": arxiv,
        "ids": ids,                           # used to match entries in summaries.json
        "abstract": doc.get("abstract"),
        "citations": doc.get("citation_count", 0),
        "refereed": "REFEREED" in (doc.get("property") or []),
    }


def main():
    data = fetch()
    docs = data.get("response", {}).get("docs", [])
    if not docs:
        sys.exit("ADS returned no records; keeping the existing file.")
    papers = [convert(d) for d in docs if d["bibcode"] not in EXCLUDE]
    out = {
        "generated": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "NASA/ADS",
        "ads_query_url": "https://ui.adsabs.harvard.edu/search/q=" + urllib.parse.quote(QUERY)
                         + "&sort=date%20desc%2C%20bibcode%20desc",
        "papers": papers,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print("Wrote %d papers to data/publications.json" % len(papers))


if __name__ == "__main__":
    main()
