"""Lesson content generation: shared factual outline -> per-style scripts ->
verification. Facts stay separate from presentation; every script is checked
against the SAME outline before it is accepted."""
from __future__ import annotations
import json
import re

from .config import STYLES
from .schemas import Source, validate_outline, validate_scene, SchemaError
from .providers.impl import extract_numbers

STYLE_BRIEF = {
    "explainer": "Clear, enthusiastic educational narration with examples. No forced slang.",
    "calm": "Warm, measured, gently paced documentary delivery.",
    "spill": "Expressive, conversational storytime with light humour — same facts, numbers and caveats.",
}

OUTLINE_SYS = ("Build a factual outline from a SOURCE for a learning video. For "
               "each concept give: title, source_id, page_ref, passage, key_claims, "
               "every numerical finding verbatim, and all qualifications/limitations. "
               "Add no facts not in the source; keep uncertainty as uncertainty. "
               "JSON: {concepts:[{concept_id,title,source_id,page_ref,passage,"
               "key_claims[],numbers[],qualifications[]}]}.")
SCRIPT_SYS = ("Write a short narration script for ONE concept in the given style. "
              "Change tone and wording freely, but preserve every number, unit and "
              "caveat from the outline exactly. Label any analogy as an analogy, not "
              "a source finding. Never invent citations. JSON: {scenes:[{narration}]}.")
VERIFY_SYS = ("Compare a narration script to the authoritative outline for ONE "
              "concept. Report missing_caveats[] and unsupported_claims[]. Empty "
              "lists if faithful. Be strict; do not approve on doubt.")


def build_outline(llm, source: Source) -> dict:
    body = "\n\n".join(f"[{s.id} · {s.ref}] {s.heading}\n{s.text}" for s in source.sections)
    outline = llm.complete_json(OUTLINE_SYS, f"TASK:outline\nSOURCE:\n{body}")
    outline["source_id"] = source.source_id
    return validate_outline(outline)


def write_script(llm, concept: dict, style: str) -> str:
    user = (f"TASK:script\nSTYLE: {STYLE_BRIEF[style]}\n"
            f"TITLE: {concept.get('title')}\nPASSAGE: {concept.get('passage')}\n"
            f"KEY CLAIMS: {concept.get('key_claims')}\n"
            f"NUMBERS (preserve exactly): {concept.get('numbers')}\n"
            f"QUALIFICATIONS (keep): {concept.get('qualifications')}")
    out = llm.complete_json(SCRIPT_SYS, user)
    scenes = out.get("scenes") or [{"narration": out.get("narration", "")}]
    return " ".join(s.get("narration", "") for s in scenes).strip()


def verify_script(llm, concept: dict, script_text: str) -> dict:
    changed = []
    # Deterministic: numerical FINDINGS must survive; no new findings introduced.
    findings = [n for n in concept.get("numbers", []) if _is_finding(n)]
    allowed = {_norm(n) for n in findings}
    in_script = {_norm(n) for n in extract_numbers(script_text) if _is_finding(n)}
    for n in findings:
        if _norm(n) not in in_script:
            changed.append({"type": "dropped", "value": n})
    for n in in_script:
        if n not in allowed:
            changed.append({"type": "introduced", "value": n})
    # Model-judged: caveats + unsupported claims. Never silently pass if it fails.
    missing, unsupported = [], []
    try:
        judged = llm.complete_json(
            VERIFY_SYS, f"TASK:verify\nOUTLINE: {json.dumps(concept)}\nSCRIPT: {script_text}")
        missing = judged.get("missing_caveats", [])
        unsupported = judged.get("unsupported_claims", [])
    except Exception as e:
        missing = [f"caveat-check-not-run: {e}"]
    ok = not (changed or missing or unsupported)
    return {"ok": ok, "changed_numbers": changed,
            "missing_caveats": missing, "unsupported_claims": unsupported}


def build_scenes(llm, source: Source, styles=STYLES) -> dict:
    outline = build_outline(llm, source)
    scenes = []
    for i, concept in enumerate(outline["concepts"]):
        scene = {
            "ord": i, "title": concept.get("title", f"Concept {i+1}"),
            "concept": i, "page_ref": concept.get("page_ref"),
            "bullets": concept.get("key_claims", [])[:4],
            "facts": concept.get("numbers", [])[:3],
            "passage": concept.get("passage"),
            "qualifications": concept.get("qualifications", []),
            "scripts": {}, "verify": {},
        }
        for style in styles:
            text = write_script(llm, concept, style)
            scene["scripts"][style] = text
            scene["verify"][style] = verify_script(llm, concept, text)
        validate_scene(scene)  # structured + validated before it leaves this stage
        scenes.append(scene)
    return {"source_id": source.source_id, "title": source.title,
            "extractor": source.extractor, "outline": outline, "scenes": scenes}


def _norm(n: str) -> str:
    return n.replace("nanometres", "nm").replace("nanometre", "nm").strip().lower()


def _is_finding(n: str) -> bool:
    return (any(u in n for u in ("nm", "%", "bp", "bond", "year", "base pair"))
            or bool(re.search(r"\d\.\d", n))
            or bool(re.fullmatch(r"(1[89]|20)\d\d\s*", n)))
