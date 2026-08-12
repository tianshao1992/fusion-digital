#!/usr/bin/env python3
"""Audit and enrich diagnostics DOI metadata using the Crossref REST API.

The script only rewrites a source record when its existing title is sufficiently
similar to the title returned for the same DOI. Low-similarity records are kept
unchanged and reported for manual scientific review, because they usually signal
an incorrect DOI rather than incomplete bibliography metadata.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Iterator


PAPER_KEYS = {"papers", "representativePapers", "sources"}
USER_AGENT = "FusionDigital-diagnostics-metadata/1.0 (mailto:tianshao1992@gmail.com)"


def canonical_doi(value: Any) -> str | None:
    raw = str(value or "").strip().lower()
    raw = re.sub(r"^(?:doi:\s*|https?://(?:dx\.)?doi\.org/)", "", raw)
    raw = raw.rstrip(" .")
    return raw if re.fullmatch(r"10\.\d{4,9}/\S+", raw) else None


def paper_doi(paper: dict[str, Any]) -> str | None:
    return canonical_doi(paper.get("doi")) or canonical_doi(paper.get("url"))


def clean_text(value: Any) -> str:
    text = html.unescape(str(value or ""))
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def title_key(value: Any) -> str:
    value = clean_text(value).lower()
    return re.sub(r"[^a-z0-9\u3400-\u9fff]+", "", value)


def title_similarity(left: Any, right: Any) -> float:
    a, b = title_key(left), title_key(right)
    if not a or not b:
        return 0.0
    sequence = SequenceMatcher(None, a, b).ratio()
    words_a = set(re.findall(r"[a-z0-9]+|[\u3400-\u9fff]", clean_text(left).lower()))
    words_b = set(re.findall(r"[a-z0-9]+|[\u3400-\u9fff]", clean_text(right).lower()))
    jaccard = len(words_a & words_b) / max(1, len(words_a | words_b))
    return max(sequence, jaccard)


def iter_papers(node: Any, path: tuple[str, ...] = ()) -> Iterator[tuple[dict[str, Any], str]]:
    if isinstance(node, dict):
        for key, value in node.items():
            child_path = (*path, key)
            if key in PAPER_KEYS and isinstance(value, list):
                for index, paper in enumerate(value):
                    if isinstance(paper, dict) and paper.get("title"):
                        yield paper, "/".join((*child_path, str(index)))
            elif isinstance(value, (dict, list)):
                yield from iter_papers(value, child_path)
    elif isinstance(node, list):
        for index, value in enumerate(node):
            yield from iter_papers(value, (*path, str(index)))


def fetch_crossref(doi: str) -> dict[str, Any]:
    endpoint = f"https://api.crossref.org/works/{urllib.parse.quote(doi, safe='')}"
    request = urllib.request.Request(endpoint, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=25) as response:
        payload = json.load(response)
    return payload["message"]


def fetch_datacite(doi: str) -> dict[str, Any]:
    endpoint = f"https://api.datacite.org/dois/{urllib.parse.quote(doi, safe='')}"
    request = urllib.request.Request(endpoint, headers={"User-Agent": USER_AGENT, "Accept": "application/vnd.api+json"})
    with urllib.request.urlopen(request, timeout=25) as response:
        attributes = json.load(response)["data"]["attributes"]
    title = clean_text(((attributes.get("titles") or [{}])[0]).get("title"))
    author_nodes = []
    for creator in attributes.get("creators") or []:
        author_nodes.append({
            "given": clean_text(creator.get("givenName")),
            "family": clean_text(creator.get("familyName") or creator.get("name")),
        })
    year = attributes.get("publicationYear")
    return {
        "title": [title],
        "author": author_nodes,
        "published-online": {"date-parts": [[year]]} if year else {},
        "container-title": [clean_text(attributes.get("publisher"))],
        "publisher": clean_text(attributes.get("publisher")),
    }


def metadata_year(message: dict[str, Any]) -> int | None:
    for key in ("published-print", "published-online", "issued", "created"):
        parts = (message.get(key) or {}).get("date-parts") or []
        if parts and parts[0]:
            try:
                return int(parts[0][0])
            except (TypeError, ValueError):
                pass
    return None


def metadata_authors(message: dict[str, Any]) -> str:
    authors = []
    for author in message.get("author") or []:
        name = clean_text(" ".join(part for part in (author.get("given"), author.get("family")) if part))
        if name:
            authors.append(name)
    if not authors:
        group = clean_text(message.get("group-title"))
        return group
    if len(authors) <= 12:
        return "; ".join(authors)
    return "; ".join(authors[:12]) + f"; et al. ({len(authors)} authors)"


def metadata_venue(message: dict[str, Any]) -> str:
    containers = [clean_text(item) for item in message.get("container-title") or [] if clean_text(item)]
    return containers[0] if containers else clean_text(message.get("publisher"))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sources-dir", type=Path, required=True)
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--threshold", type=float, default=0.42)
    parser.add_argument("--delay-ms", type=int, default=80)
    args = parser.parse_args()

    files = sorted(args.sources_dir.glob("*.json"))
    cache: dict[str, Any] = {}
    if args.cache.exists():
        cache = json.loads(args.cache.read_text(encoding="utf-8"))

    documents: list[tuple[Path, Any]] = []
    occurrences: dict[str, list[tuple[dict[str, Any], Path, str]]] = {}
    for path in files:
        data = json.loads(path.read_text(encoding="utf-8"))
        documents.append((path, data))
        for paper, json_path in iter_papers(data):
            doi = paper_doi(paper)
            if doi:
                occurrences.setdefault(doi, []).append((paper, path, json_path))

    for index, doi in enumerate(sorted(occurrences)):
        if doi in cache and cache[doi].get("ok"):
            continue
        try:
            cache[doi] = {"ok": True, "message": fetch_crossref(doi)}
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                try:
                    cache[doi] = {"ok": True, "message": fetch_datacite(doi), "source": "DataCite"}
                except Exception as datacite_exc:
                    cache[doi] = {"ok": False, "error": f"Crossref HTTP 404; DataCite {type(datacite_exc).__name__}: {datacite_exc}"}
            else:
                cache[doi] = {"ok": False, "error": f"HTTP {exc.code}"}
        except Exception as exc:  # network failures must be visible in the audit
            cache[doi] = {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
        if index + 1 < len(occurrences):
            time.sleep(max(0, args.delay_ms) / 1000)

    args.cache.parent.mkdir(parents=True, exist_ok=True)
    args.cache.write_text(json.dumps(cache, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    audit_rows = []
    changed_files: set[Path] = set()
    for doi, records in sorted(occurrences.items()):
        cached = cache.get(doi) or {}
        if not cached.get("ok"):
            for paper, path, json_path in records:
                audit_rows.append({"doi": doi, "file": path.name, "path": json_path, "status": "lookup-failed", "error": cached.get("error"), "currentTitle": paper.get("title")})
            continue
        message = cached["message"]
        crossref_title = clean_text((message.get("title") or [""])[0])
        year = metadata_year(message)
        authors = metadata_authors(message)
        venue = metadata_venue(message)
        for paper, path, json_path in records:
            similarity = title_similarity(paper.get("title"), crossref_title)
            match = similarity >= args.threshold or not clean_text(paper.get("title"))
            audit_rows.append({
                "doi": doi, "file": path.name, "path": json_path,
                "status": "matched" if match else "title-mismatch",
                "similarity": round(similarity, 4), "currentTitle": paper.get("title"),
                "crossrefTitle": crossref_title, "crossrefYear": year,
                "crossrefAuthors": authors, "crossrefVenue": venue,
            })
            if args.apply and match:
                paper["doi"] = doi
                paper["url"] = f"https://doi.org/{doi}"
                if crossref_title:
                    paper["title"] = crossref_title
                if authors:
                    paper["authors"] = authors
                if year:
                    paper["year"] = year
                if venue:
                    paper["venue"] = venue
                changed_files.add(path)

    if args.apply:
        for path, data in documents:
            if path in changed_files:
                path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    summary = {
        "uniqueDois": len(occurrences),
        "occurrences": sum(len(value) for value in occurrences.values()),
        "matched": sum(row["status"] == "matched" for row in audit_rows),
        "titleMismatches": sum(row["status"] == "title-mismatch" for row in audit_rows),
        "lookupFailures": sum(row["status"] == "lookup-failed" for row in audit_rows),
        "changedFiles": sorted(path.name for path in changed_files),
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps({"summary": summary, "records": audit_rows}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
