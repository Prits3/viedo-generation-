"""Central config + versioning. Everything reproducible is stamped from here."""
from __future__ import annotations
import os
from dataclasses import dataclass

APP_NAME = "Lumina Learn"

# Version stamps recorded with every generated lesson (provenance).
PROMPT_VERSION = "2026-11-21.1"
SCENE_SCHEMA_VERSION = 1
OUTLINE_SCHEMA_VERSION = 1

STYLES = ("explainer", "calm", "spill")


@dataclass
class Settings:
    db_path: str = os.environ.get("LUMINA_DB", "lumina.db")
    storage_dir: str = os.environ.get("LUMINA_STORAGE", "storage")
    model_backend: str = os.environ.get("MODEL", "mock")  # "mock" | "bedrock"
    bedrock_model_id: str = os.environ.get(
        "BEDROCK_MODEL_ID", "us.anthropic.claude-sonnet-4-5-20250929-v1:0")
    aws_region: str = os.environ.get("AWS_REGION", "us-east-1")
    speech_backend: str = os.environ.get("SPEECH", "fallback")  # "fallback" | "kokoro"
    parser_backend: str = os.environ.get("PARSER", "auto")  # "auto" | "pypdf" | "docling" | "text"
    allowed_origins: str = os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173")
    max_upload_mb: int = int(os.environ.get("LUMINA_MAX_UPLOAD_MB", "25"))

    def provenance(self) -> dict:
        return {
            "prompt_version": PROMPT_VERSION,
            "scene_schema_version": SCENE_SCHEMA_VERSION,
            "model_backend": self.model_backend,
            "model_id": self.bedrock_model_id if self.model_backend == "bedrock" else "mock",
        }


settings = Settings()
