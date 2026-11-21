"""The six provider interfaces the brief calls for. One method each where it can
be; implementations live in `impl.py`. Keeping these as Protocols means we add
alternatives without touching application code."""
from __future__ import annotations
from typing import Protocol, runtime_checkable
from ..schemas import Source


@runtime_checkable
class Parser(Protocol):
    name: str
    def can_handle(self, filename: str) -> bool: ...
    def parse(self, path: str) -> Source: ...


@runtime_checkable
class LLM(Protocol):
    name: str
    def complete_json(self, system: str, user: str) -> dict: ...
    def complete_text(self, system: str, user: str) -> str: ...


@runtime_checkable
class Speech(Protocol):
    name: str
    # Returns {engine, path|None, supported_controls, note}. Never fakes audio.
    def synth(self, text: str, style: str, out_path: str, speed: float = 1.0) -> dict: ...


@runtime_checkable
class Retriever(Protocol):
    name: str
    # Returns passages [{concept_id, page_ref, passage, numbers}] scoped to a source.
    def retrieve(self, outline: dict, query: str, k: int = 3) -> list: ...


@runtime_checkable
class ActivityGenerator(Protocol):
    name: str
    def question_for(self, concept: dict) -> dict: ...


@runtime_checkable
class Renderer(Protocol):
    name: str
    # M1 renderer = produce a storyboard the frontend plays. Server-side MP4 later.
    def storyboard(self, scene: dict) -> dict: ...
