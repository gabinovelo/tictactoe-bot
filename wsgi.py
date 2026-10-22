# Entrada para a Vercel: os imports do projeto partem de src/,
# mas a Vercel roda a partir da raiz do repositório.
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from api.app import app  # noqa: E402,F401
