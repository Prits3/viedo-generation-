"""Structured, validated data passed between stages. Model output is validated
here before it is stored or sent downstream — a stage never trusts raw text."""
from __future__ import annotations
from dataclasses import dataclass, field, asdict
from .config import STYLES


class SchemaError(ValueError):
    """Raised when generated content does not match the expected schema."""


# ---- domain objects ----------------------------------------------------------
@dataclass
class Section:
    id: str
    ref: str           # human source location, e.g. "p.3" / "§2"
    heading: str
    text: str


@dataclass
class Source:
    source_id: str
    title: str
    extractor: str     # which parser actually ran (honest)
    sections: list     # list[Section]

    def to_dict(self):
        d = asdict(self)
        return d


@dataclass
class Concept:
    concept_id: str
    title: str
    source_id: str
    page_ref: str
    passage: str
    key_claims: list = field(default_factory=list)
    numbers: list = field(default_factory=list)          # numerical findings, verbatim
    qualifications: list = field(default_factory=list)   # caveats/limitations


# ---- validators --------------------------------------------------------------
def validate_outline(d: dict) -> dict:
    if not isinstance(d, dict) or "concepts" not in d:
        raise SchemaError("outline must be an object with a 'concepts' list")
    if not isinstance(d["concepts"], list) or not d["concepts"]:
        raise SchemaError("outline.concepts must be a non-empty list")
    for i, c in enumerate(d["concepts"]):
        for key in ("concept_id", "title", "page_ref", "passage"):
            if key not in c or not isinstance(c[key], str):
                raise SchemaError(f"concept[{i}] missing string '{key}'")
        for key in ("key_claims", "numbers", "qualifications"):
            if key in c and not isinstance(c[key], list):
                raise SchemaError(f"concept[{i}].{key} must be a list")
    return d


def validate_scene(s: dict) -> dict:
    req_str = ("title",)
    for k in req_str:
        if not isinstance(s.get(k), str) or not s[k].strip():
            raise SchemaError(f"scene missing non-empty string '{k}'")
    if not isinstance(s.get("bullets", []), list):
        raise SchemaError("scene.bullets must be a list")
    scripts = s.get("scripts")
    if not isinstance(scripts, dict):
        raise SchemaError("scene.scripts must be an object keyed by style")
    for style in STYLES:
        if style not in scripts or not isinstance(scripts[style], str) or not scripts[style].strip():
            raise SchemaError(f"scene.scripts['{style}'] must be a non-empty string")
    if not isinstance(s.get("verify", {}), dict):
        raise SchemaError("scene.verify must be an object")
    return s


def validate_question(q: dict) -> dict:
    if not isinstance(q.get("question"), str) or not q["question"].strip():
        raise SchemaError("question.question must be a non-empty string")
    choices = q.get("choices")
    if not isinstance(choices, list) or len(choices) < 2:
        raise SchemaError("question.choices must have at least 2 options")
    if sum(1 for c in choices if c.get("ok")) != 1:
        raise SchemaError("question must have exactly one correct choice")
    for c in choices:
        if not isinstance(c.get("t"), str):
            raise SchemaError("each choice needs text 't'")
    return q
