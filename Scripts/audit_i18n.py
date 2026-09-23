"""Audit public-page translation coverage and catalog integrity.

Run from the repository root with ``python Scripts/audit_i18n.py``.
The browser translator uses normalized English text as its lookup key, so this
script mirrors that normalization for page text, translatable attributes, and
literal calls to the page translation helpers.
"""

from __future__ import annotations

import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
I18N_DIR = ROOT / "wwwroot" / "assets" / "i18n"
PUBLIC_VIEWS = ROOT / "Views" / "Home"
SHARED_COMPONENTS = ROOT / "Views" / "Shared"
PAGE_SCRIPTS = ROOT / "wwwroot" / "assets" / "js" / "pages"
LANGUAGES = ("en", "hi", "or")
TRANSLATABLE_ATTRIBUTES = {"placeholder", "title", "aria-label", "alt"}
SKIPPED_TAGS = {"script", "style", "noscript"}


def normalize(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def load_catalog(language: str) -> dict[str, str]:
    merged: dict[str, str] = {}
    for suffix in (".json", ".overrides.json", ".completion.json"):
        path = I18N_DIR / f"{language}{suffix}"
        if path.exists():
            merged.update(json.loads(path.read_text(encoding="utf-8-sig")))
    return merged


class PageTextParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.stack: list[tuple[str, bool]] = []
        self.strings: set[str] = set()

    @property
    def is_skipped(self) -> bool:
        return any(skipped for _, skipped in self.stack)

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        inherited_skip = self.is_skipped
        own_skip = tag in SKIPPED_TAGS or any(name == "data-i18n-skip" for name, _ in attrs)
        self.stack.append((tag, inherited_skip or own_skip))
        if inherited_skip or own_skip:
            return
        for name, value in attrs:
            if name in TRANSLATABLE_ATTRIBUTES and value:
                self.add(value)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)
        self.handle_endtag(tag)

    def handle_endtag(self, tag: str) -> None:
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index][0] == tag:
                del self.stack[index:]
                return

    def handle_data(self, data: str) -> None:
        if not self.is_skipped:
            self.add(data)

    def add(self, value: str) -> None:
        value = normalize(value)
        if value and not value.startswith("@") and re.search(r"[A-Za-z]", value):
            self.strings.add(value)


def decode_js_literal(quote: str, body: str) -> str | None:
    if quote == "`" and "${" in body:
        return None
    try:
        # JSON decoding correctly handles the escape sequences used in these
        # source literals. Single quotes and backticks need quote normalization.
        escaped = body.replace('"', '\\"') if quote != '"' else body
        return json.loads(f'"{escaped}"')
    except json.JSONDecodeError:
        return normalize(body)


def collect_source_strings() -> tuple[set[str], dict[str, set[str]]]:
    strings: set[str] = set()
    locations: dict[str, set[str]] = {}

    html_paths = sorted(PUBLIC_VIEWS.glob("*.html"))
    html_paths += [
        path
        for path in sorted(PUBLIC_VIEWS.glob("*.cshtml"))
        if "assets/js/core/i18n.js" in path.read_text(encoding="utf-8-sig")
    ]
    html_paths += sorted(SHARED_COMPONENTS.glob("*.html"))
    for path in html_paths:
        parser = PageTextParser()
        parser.feed(path.read_text(encoding="utf-8-sig"))
        for value in parser.strings:
            strings.add(value)
            locations.setdefault(value, set()).add(str(path.relative_to(ROOT)))

    helper_names = (
        "t",
        "translateCancerAge",
        "translateIncidence",
        "translateMortality",
        "cancerBurdenTranslate",
    )
    call_pattern = re.compile(
        rf"\b(?:{'|'.join(helper_names)})\s*\(\s*([\"'`])((?:\\.|(?!\1).)*)\1",
        re.DOTALL,
    )
    for path in sorted(PAGE_SCRIPTS.glob("*.js")):
        source = path.read_text(encoding="utf-8-sig")
        for match in call_pattern.finditer(source):
            value = decode_js_literal(match.group(1), match.group(2))
            if value:
                value = normalize(value)
                strings.add(value)
                locations.setdefault(value, set()).add(str(path.relative_to(ROOT)))

        if path.name == "team.js":
            for match in re.finditer(r'\b(?:title|designation):\s*"((?:\\.|[^"\\])*)"', source):
                value = decode_js_literal('"', match.group(1))
                if value:
                    value = normalize(value)
                    strings.add(value)
                    locations.setdefault(value, set()).add(str(path.relative_to(ROOT)))

    return strings, locations


def placeholders(value: str) -> set[str]:
    return set(re.findall(r"{{([^{}]+)}}", value))


def catalog_covers(catalog: dict[str, str], source: str) -> bool:
    if source in catalog:
        return True
    for key in catalog:
        if "{{" not in key:
            continue
        pattern = re.escape(key)
        pattern = re.sub(r"\\\{\\\{[^{}]+\\\}\\\}", r".+?", pattern)
        if re.fullmatch(pattern, source):
            return True
    return False


def main() -> int:
    catalogs = {language: load_catalog(language) for language in LANGUAGES}
    sources, locations = collect_source_strings()
    failures: list[str] = []

    for language in ("hi", "or"):
        missing = sorted(value for value in sources if not catalog_covers(catalogs[language], value))
        if missing:
            failures.append(f"{language}: {len(missing)} source strings are missing")
            for value in missing:
                print(f"MISSING {language}: {value} [{', '.join(sorted(locations[value]))}]")

        empty = sorted(key for key, value in catalogs[language].items() if not normalize(str(value)))
        if empty:
            failures.append(f"{language}: {len(empty)} translations are empty")

        bad_templates = sorted(
            key
            for key, value in catalogs[language].items()
            if placeholders(key) != placeholders(str(value))
        )
        if bad_templates:
            failures.append(f"{language}: {len(bad_templates)} placeholder sets differ")
            for key in bad_templates:
                print(f"PLACEHOLDER {language}: {key} -> {catalogs[language][key]}")

    asymmetric = sorted(set(catalogs["hi"]) ^ set(catalogs["or"]))
    if asymmetric:
        failures.append(f"hi/or: {len(asymmetric)} catalog keys are asymmetric")
        for key in asymmetric:
            present = "hi" if key in catalogs["hi"] else "or"
            print(f"ASYMMETRIC ({present} only): {key}")

    print(
        f"Audited {len(sources)} normalized public-page strings; "
        + ", ".join(f"{lang}={len(catalogs[lang])} catalog entries" for lang in LANGUAGES)
        + "."
    )
    if failures:
        print("FAILED: " + "; ".join(failures))
        return 1
    print("PASS: Hindi and Odia cover every audited source string with valid templates and symmetric keys.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
