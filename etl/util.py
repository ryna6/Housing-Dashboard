from pathlib import Path
import json
from typing import Iterable

from .config import PROCESSED_DIR, PROCESSED_FILES

def ensure_processed_dir() -> None:
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

def ensure_empty_files(files: Iterable[str] | None = None) -> None:
    """
    For now, just make sure each expected processed file exists
    and contains a valid empty JSON array [].
    """
    ensure_processed_dir()
    if files is None:
        files = PROCESSED_FILES

    for name in files:
        path = PROCESSED_DIR / name
        if not path.exists():
            path.write_text("[]", encoding="utf-8")
        else:
            # If file is empty/invalid, overwrite with []
            try:
                text = path.read_text(encoding="utf-8").strip()
                if not text:
                    raise ValueError("empty")
                json.loads(text)
            except Exception:
                path.write_text("[]", encoding="utf-8")

