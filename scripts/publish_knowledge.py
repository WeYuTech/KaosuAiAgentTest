"""管理員以具體案例與真實模型回歸後發布候選知識。"""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from app.knowledge_release import release_cli

if __name__ == "__main__":
    raise SystemExit(release_cli())
