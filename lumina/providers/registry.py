"""Chooses the one provider per interface from config. Add a backend here, not
in application code."""
from __future__ import annotations
from ..config import Settings
from . import impl


def get_llm(s: Settings):
    if s.model_backend == "bedrock":
        return impl.BedrockLLM(s.bedrock_model_id, s.aws_region)
    return impl.MockLLM()


def get_parsers(s: Settings) -> list:
    # Ordered by preference; the first that can_handle() wins.
    parsers = []
    if s.parser_backend in ("auto", "docling"):
        parsers.append(impl.DoclingParser())
    if s.parser_backend in ("auto", "pypdf"):
        parsers.append(impl.PyPdfParser())
    parsers.append(impl.TextParser())
    return parsers


def pick_parser(parsers: list, filename: str):
    for p in parsers:
        if p.can_handle(filename):
            return p
    raise RuntimeError(f"No parser for {filename}. Supported: .pdf/.txt/.md "
                       "(docx/pptx with docling installed).")


def get_speech(s: Settings):
    return impl.KokoroSpeech() if s.speech_backend == "kokoro" else impl.BrowserFallback()


def get_retriever(s: Settings):
    return impl.KeywordRetriever()


def get_activity_generator(s: Settings, llm):
    return impl.LLMActivityGenerator(llm)


def get_renderer(s: Settings):
    return impl.StoryboardRenderer()
