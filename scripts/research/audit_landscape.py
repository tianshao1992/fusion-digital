from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import urlparse


DOMAINS = {
    "physics",
    "engineering",
    "control",
    "diagnostics",
    "energy",
    "auxiliary",
    "data",
    "hmi",
    "integration",
}
CODE_STATUSES = {
    "official-direct",
    "official-enabling",
    "commercial-enabling",
    "community-reproduction",
    "not-public",
}
REQUIRED = {
    "id",
    "domain",
    "title",
    "year",
    "organization",
    "problem",
    "approach",
    "devices",
    "evidenceLevel",
    "evidence",
    "papers",
    "code",
    "data",
    "maturity",
    "limitations",
    "tags",
}


def is_url(value: object) -> bool:
    if not isinstance(value, str):
        return False
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("data", type=Path)
    args = parser.parse_args()

    payload = json.loads(args.data.read_text(encoding="utf-8"))
    entries = payload["entries"]
    errors: list[str] = []
    warnings: list[str] = []

    ids = [entry.get("id") for entry in entries]
    duplicates = [item for item, count in Counter(ids).items() if count > 1]
    if duplicates:
        errors.append(f"duplicate ids: {duplicates}")

    paper_sets: dict[tuple[str, ...], list[str]] = defaultdict(list)
    for entry in entries:
        entry_id = str(entry.get("id"))
        missing = sorted(REQUIRED - set(entry))
        if missing:
            errors.append(f"{entry_id}: missing fields {missing}")

        primary = entry.get("primaryDomain", entry.get("domain"))
        related = entry.get("relatedDomains", [])
        if primary not in DOMAINS:
            errors.append(f"{entry_id}: invalid primary domain {primary!r}")
        if entry.get("domain") != primary:
            errors.append(f"{entry_id}: domain and primaryDomain disagree")
        if not isinstance(related, list) or any(domain not in DOMAINS for domain in related):
            errors.append(f"{entry_id}: invalid relatedDomains {related!r}")
        if primary in related:
            errors.append(f"{entry_id}: primary domain repeated in relatedDomains")

        papers = entry.get("papers", [])
        if not papers:
            errors.append(f"{entry_id}: no paper or primary source")
        paper_urls: list[str] = []
        for paper in papers:
            if not is_url(paper.get("url")):
                errors.append(f"{entry_id}: malformed paper URL {paper.get('url')!r}")
            else:
                paper_urls.append(paper["url"].rstrip("/"))
        if paper_urls:
            paper_sets[tuple(sorted(set(paper_urls)))].append(entry_id)

        for code in entry.get("code", []):
            status = code.get("status")
            if status not in CODE_STATUSES:
                errors.append(f"{entry_id}: invalid code status {status!r}")
            if code.get("url") and not is_url(code.get("url")):
                errors.append(f"{entry_id}: malformed code URL {code.get('url')!r}")
            if status == "commercial-enabling" and code.get("access") != "proprietary":
                errors.append(f"{entry_id}: commercial code must declare proprietary access")

    for urls, duplicate_entries in paper_sets.items():
        if len(duplicate_entries) > 1:
            warnings.append(
                "same primary-source set used by multiple works: "
                f"{duplicate_entries} ({', '.join(urls)})"
            )

    old_tokamind = "https://huggingface.co/UKAEA-IBM-STFC/tokamind"
    serialized = json.dumps(payload, ensure_ascii=False)
    if f'"{old_tokamind}"' in serialized:
        errors.append("obsolete TokaMind model URL remains")

    associations = Counter()
    for entry in entries:
        associations[entry.get("primaryDomain", entry["domain"])] += 1
        associations.update(entry.get("relatedDomains", []))
    unique_papers = {
        paper["url"].rstrip("/")
        for entry in entries
        for paper in entry.get("papers", [])
        if is_url(paper.get("url"))
    }
    unique_code_links = {
        code["url"].rstrip("/")
        for entry in entries
        for code in entry.get("code", [])
        if is_url(code.get("url"))
    }

    print(
        json.dumps(
            {
                "uniqueWorks": len(entries),
                "domainAssociations": dict(sorted(associations.items())),
                "uniquePrimarySources": len(unique_papers),
                "uniqueCodeLinks": len(unique_code_links),
                "warnings": warnings,
                "errors": errors,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
