"""Deterministic archive from an explicit list; refuse symlink inputs."""
import sys
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
output, root, *names = sys.argv[1:]
with ZipFile(output, 'w', compression=ZIP_DEFLATED) as archive:
    for name in sorted(names):
        p = Path(root) / name
        if p.is_symlink() or not p.is_file() or '..' in Path(name).parts:
            raise ValueError('Invalid archive input')
        info = ZipInfo(name, (2026, 1, 1, 0, 0, 0))
        info.compress_type = ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, p.read_bytes())
