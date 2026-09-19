"""Copy tracked web files into dist for static hosting; no game build required."""
from pathlib import Path
import shutil
import subprocess


root = Path(__file__).resolve().parent.parent
output = root / "dist"
tracked = subprocess.check_output(
    ["git", "ls-files", "-z"], cwd=root
).decode().split("\0")
files = [
    Path(name) for name in tracked if name and (
        (Path(name).parent == Path(".") and Path(name).suffix == ".html")
        or (Path(name).parts[0] in {"src", "tests"}
            and (Path(name).suffix in {".html", ".js", ".css"} or Path(name).name == "LICENSE"))
    )
]
if Path("index.html") not in files:
    raise SystemExit("Missing tracked index.html")
if any((root / path).is_symlink() for path in files) or output.is_symlink():
    raise SystemExit("Static files and dist must not be symbolic links")
if output.exists():
    shutil.rmtree(output)
for path in files:
    destination = output / path
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(root / path, destination)
print(f"Prepared {len(files)} web files in dist/ (assets and local files excluded)")
