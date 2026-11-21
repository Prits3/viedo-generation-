"""One working implementation per interface. Heavy deps (docling, boto3, kokoro)
are imported lazily so the mock/text paths run with the stdlib only."""
from __future__ import annotations
import json
import os
import re
from pathlib import Path

from ..schemas import Source, Section


# ============================ Parsers =========================================
class TextParser:
    name = "text"

    def can_handle(self, filename: str) -> bool:
        return filename.lower().endswith((".txt", ".md"))

    def parse(self, path: str) -> Source:
        raw = Path(path).read_text(encoding="utf-8")
        sid = Path(path).stem
        parts = re.split(r"\n(?=§\s*\d+|\d+\.\s+[A-Z])", raw.strip())
        sections = []
        for i, block in enumerate(parts, start=1):
            block = block.strip()
            if not block:
                continue
            heading = block.split("\n")[0]
            m = re.match(r"(§\s*\d+|\d+)", heading)
            ref = (m.group(1).replace(" ", "") if m else f"§{i}")
            if not ref.startswith("§"):
                ref = "§" + ref
            sections.append(Section(f"{sid}-s{i}", ref, heading[:80], block))
        return Source(sid, Path(path).name, "text", sections)


class PyPdfParser:
    name = "pypdf"

    def can_handle(self, filename: str) -> bool:
        return filename.lower().endswith(".pdf")

    def parse(self, path: str) -> Source:
        from pypdf import PdfReader  # lazy
        reader = PdfReader(path)
        sid = Path(path).stem
        sections = []
        for i, page in enumerate(reader.pages, start=1):
            text = (page.extract_text() or "").strip()
            if text:
                sections.append(Section(f"{sid}-p{i}", f"p.{i}",
                                        text.split("\n")[0][:80], text))
        if not sections:
            raise RuntimeError("No extractable text (scanned PDF?). OCR is backlog.")
        return Source(sid, sid, "pypdf", sections)


class DoclingParser:
    name = "docling"

    def can_handle(self, filename: str) -> bool:
        return filename.lower().endswith((".pdf", ".docx", ".pptx", ".html"))

    def parse(self, path: str) -> Source:
        from docling.document_converter import DocumentConverter  # lazy
        doc = DocumentConverter().convert(path).document
        sid = Path(path).stem
        by_page: dict[int, list[str]] = {}
        for item, _lvl in doc.iterate_items():
            text = getattr(item, "text", None)
            if not text:
                continue
            page = 1
            prov = getattr(item, "prov", None)
            if prov:
                page = getattr(prov[0], "page_no", 1)
            by_page.setdefault(page, []).append(text)
        sections = []
        for page in sorted(by_page):
            joined = "\n".join(by_page[page]).strip()
            if joined:
                sections.append(Section(f"{sid}-p{page}", f"p.{page}",
                                        joined.split("\n")[0][:80], joined))
        return Source(sid, getattr(doc, "name", sid) or sid, "docling", sections)


# ============================ LLMs ============================================
class MockLLM:
    """Offline, deterministic. Builds structure from the input only; never
    fabricates source facts. Clearly labelled as mock in provenance."""
    name = "mock"

    def complete_text(self, system: str, user: str) -> str:
        return "[mock] " + user[:200]

    def complete_json(self, system: str, user: str) -> dict:
        tag = user.splitlines()[0].strip() if user else ""
        if tag.startswith("TASK:outline"):
            return self._outline(user)
        if tag.startswith("TASK:script"):
            # Faithful mock: echo the passage so numbers survive verification.
            passage = _field(user, "PASSAGE")
            return {"scenes": [{"narration": passage}]}
        if tag.startswith("TASK:verify"):
            return {"missing_caveats": [], "unsupported_claims": []}
        if tag.startswith("TASK:question"):
            return {"question": "Mock check: " + _field(user, "TITLE")[:40] + "?",
                    "choices": [{"t": "Correct (mock)", "ok": True},
                                {"t": "Wrong A", "ok": False, "why": "mock"},
                                {"t": "Wrong B", "ok": False, "why": "mock"}],
                    "good": "mock"}
        if tag.startswith("TASK:tutor"):
            return {"grounding": "source", "answer": "[mock] grounded answer.",
                    "citations": []}
        return {}

    def _outline(self, user: str) -> dict:
        concepts = []
        for i, block in enumerate(re.split(r"\n\n(?=\[)", user)):
            block = block.strip()
            if not block or block.startswith("TASK:") or block.startswith("SOURCE"):
                continue
            m = re.match(r"\[(\S+)\s·?\s*([^\]]+)\]\s*(.*)", block, re.S)
            ref = (m.group(2).strip() if m else f"§{i}")
            body = (m.group(3) if m else block)
            concepts.append({
                "concept_id": f"c{i}",
                "title": body.split("\n")[0][:60] or f"Concept {i}",
                "source_id": "src", "page_ref": ref,
                "passage": body[:400],
                "key_claims": [body.split(".")[0][:140]],
                "numbers": _numbers(body),
                "qualifications": [],
            })
        return {"concepts": concepts or [{"concept_id": "c0", "title": "mock",
                "source_id": "src", "page_ref": "§1", "passage": user[:200],
                "key_claims": [], "numbers": _numbers(user), "qualifications": []}]}


class BedrockLLM:
    """Real Bedrock Converse. Key from AWS_BEARER_TOKEN_BEDROCK only."""
    def __init__(self, model_id: str, region: str):
        import boto3  # lazy
        if not os.environ.get("AWS_BEARER_TOKEN_BEDROCK"):
            raise RuntimeError("AWS_BEARER_TOKEN_BEDROCK not set (use a rotated key).")
        self.model_id = model_id
        self.client = boto3.client("bedrock-runtime", region_name=region)
        self.name = f"bedrock:{model_id}"

    def _converse(self, system: str, user: str, max_tokens: int = 1200) -> str:
        r = self.client.converse(
            modelId=self.model_id, system=[{"text": system}],
            messages=[{"role": "user", "content": [{"text": user}]}],
            inferenceConfig={"maxTokens": max_tokens, "temperature": 0.2})
        return r["output"]["message"]["content"][0]["text"]

    def complete_text(self, system: str, user: str) -> str:
        return self._converse(system, user)

    def complete_json(self, system: str, user: str) -> dict:
        raw = self._converse(system + "\nReply with one JSON object only.", user)
        return _extract_json(raw)


class AnthropicLLM:
    """Direct Anthropic API — the same key convention the frontend uses
    (ANTHROPIC_API_KEY), so one key powers both generation and the tutor."""
    def __init__(self, model: str):
        import anthropic  # lazy
        if not os.environ.get("ANTHROPIC_API_KEY"):
            raise RuntimeError("ANTHROPIC_API_KEY not set (use a rotated key).")
        self.client = anthropic.Anthropic()
        self.model = model
        self.name = f"anthropic:{model}"

    def complete_text(self, system: str, user: str) -> str:
        r = self.client.messages.create(
            model=self.model, max_tokens=1000, system=system,
            messages=[{"role": "user", "content": user}])
        return "".join(b.text for b in r.content if getattr(b, "type", "") == "text")

    def complete_json(self, system: str, user: str) -> dict:
        raw = self.complete_text(system + "\nReply with one JSON object only.", user)
        return _extract_json(raw)


# ============================ Speech ==========================================
_KOKORO_VOICES = {"explainer": "af_heart", "calm": "bm_george", "spill": "af_bella"}


class BrowserFallback:
    name = "browser-fallback"

    def synth(self, text, style, out_path, speed=1.0) -> dict:
        return {"engine": "browser-fallback", "path": None,
                "supported_controls": ["rate", "pitch"],
                "note": "No server TTS; frontend narrates with the browser engine."}


class KokoroSpeech:
    name = "kokoro"

    def synth(self, text, style, out_path, speed=1.0) -> dict:
        try:
            from kokoro import KPipeline  # lazy
            import soundfile as sf
            import numpy as np
        except ImportError:
            return BrowserFallback().synth(text, style, out_path, speed)
        pipe = KPipeline(lang_code="a")
        audio = np.concatenate([a for _, _, a in pipe(
            text, voice=_KOKORO_VOICES.get(style, "af_heart"), speed=speed)])
        Path(out_path).parent.mkdir(parents=True, exist_ok=True)
        sf.write(out_path, audio, 24000)
        return {"engine": "kokoro", "path": out_path,
                "supported_controls": ["voice", "speed"],
                "note": "Kokoro: voice + speed only; no emotion tags."}


# ============================ Retrieval =======================================
class KeywordRetriever:
    name = "keyword"

    def retrieve(self, outline: dict, query: str, k: int = 3) -> list:
        q = set(_tokens(query))
        scored = []
        for c in outline.get("concepts", []):
            text = c.get("passage", "") + " " + " ".join(c.get("key_claims", []))
            overlap = len(q & set(_tokens(text)))
            if overlap:
                scored.append((overlap, c))
        scored.sort(key=lambda x: -x[0])
        return [{"concept_id": c["concept_id"], "page_ref": c.get("page_ref"),
                 "passage": c.get("passage"), "numbers": c.get("numbers", [])}
                for _, c in scored[:k]]


# ============================ Activities ======================================
class LLMActivityGenerator:
    def __init__(self, llm: "LLM"):
        self.llm = llm
        self.name = f"llm-activity:{llm.name}"

    def question_for(self, concept: dict) -> dict:
        sys = ("Write ONE multiple-choice question targeting a likely "
               "misunderstanding of this concept. Ground it in the passage; no "
               "unrelated content. JSON: {question, choices:[{t,ok,why}], good}.")
        user = f"TASK:question\nTITLE: {concept.get('title')}\nCONCEPT: {json.dumps(concept)}"
        return self.llm.complete_json(sys, user)


# ============================ Renderer ========================================
class StoryboardRenderer:
    name = "storyboard"

    def storyboard(self, scene: dict) -> dict:
        return {"diagram": "bullets", "bullets": scene.get("bullets", [])[:4],
                "title": scene.get("title")}


# ============================ shared helpers ==================================
_NUM_RE = re.compile(r"(?<![\w.])(\d+(?:\.\d+)?)\s*(nm|%|bp|base pairs?|nanometres?|"
                     r"hydrogen bonds?|years?)?", re.I)


def _numbers(text: str) -> list:
    out = []
    for m in _NUM_RE.finditer(text):
        token = f"{m.group(1)} {(m.group(2) or '').strip().lower()}".strip()
        if token not in out:
            out.append(token)
    return out


def extract_numbers(text: str) -> list:
    return _numbers(text)


_STOP = {"the", "and", "for", "with", "what", "are", "was", "how", "why", "who",
         "does", "did", "you", "your", "this", "that", "from", "about", "into",
         "than", "then", "them", "they", "tell", "more", "its", "it's", "can",
         "will", "would", "could", "have", "has", "but", "not", "all", "any"}


def _tokens(s: str) -> list:
    return [w for w in re.findall(r"[a-z0-9]+", s.lower())
            if len(w) > 2 and w not in _STOP]


def _field(user: str, name: str) -> str:
    m = re.search(rf"^{name}:\s*(.*)$", user, re.M)
    return m.group(1).strip() if m else ""


def _extract_json(raw: str) -> dict:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```[a-z]*\n?|\n?```$", "", raw).strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", raw, re.S)
        if m:
            return json.loads(m.group(0))
        raise
