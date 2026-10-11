"""Scan every local Git object and release file without printing matched data."""
import re
import subprocess
import zlib
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
EXPECTED_IDENTITY = 'Maristie <me@maristie.com>'
# Split personal path prefixes so this scanner does not match its own source.
PATTERNS = [
    r'gh[pousr]_[A-Za-z0-9]{30,}', r'github_pat_[A-Za-z0-9_]{30,}',
    r'(?:AKIA|ASIA)[A-Z0-9]{16}', r'AIza[A-Za-z0-9_-]{35}',
    r'xox[baprs]-[A-Za-z0-9-]{20,}', r'sk_live_[A-Za-z0-9]{20,}',
    r'-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----',
    r'/' + 'Users' + r'/[^\s\"\']+', r'/' + 'home' + r'/[^\s\"\']+',
]
COMBINED = re.compile('|'.join(PATTERNS))


def check(name, data):
    # Binary files may contain paths or credentials too, including UTF-16 metadata.
    for text in (str(name), data.decode('utf-8', errors='ignore'),
                 data.decode('utf-16le', errors='ignore'),
                 data.decode('utf-16be', errors='ignore')):
        if COMBINED.search(text):
            raise AssertionError('Sensitive material scan failed; matched data withheld')
    # PNG text metadata can be compressed independently of the image pixels.
    if data.startswith(b'\x89PNG\r\n\x1a\n'):
        offset = 8
        while offset + 12 <= len(data):
            size = int.from_bytes(data[offset:offset + 4], 'big')
            kind = data[offset + 4:offset + 8]
            payload = data[offset + 8:offset + 8 + size]
            offset += size + 12
            if kind == b'zTXt':
                _, compressed = payload.split(b'\0', 1)
                check('PNG text metadata', zlib.decompress(compressed[1:]))
            elif kind == b'iTXt':
                _, rest = payload.split(b'\0', 1)
                compressed, method = rest[:2]
                _, _, text = rest[2:].split(b'\0', 2)
                check('PNG text metadata', zlib.decompress(text) if compressed else text)


def git(root, *args):
    return subprocess.check_output(['git', *args], cwd=root)


def scan_history(root):
    # Includes reflog-only and dangling objects left by amendments, not just refs.
    objects = git(root, 'cat-file', '--batch-all-objects',
                  '--batch-check=%(objectname) %(objecttype)').splitlines()
    commits = 0
    for record in objects:
        sha, kind = record.decode().split()
        data = git(root, 'cat-file', kind, sha)
        check('Git object', data)
        if kind == 'commit':
            identities = git(root, 'show', '-s', '--format=%an <%ae>%n%cn <%ce>', sha).decode().splitlines()
            if identities != [EXPECTED_IDENTITY] * 2:
                raise AssertionError('Unexpected commit identity; identity withheld')
            commits += 1
            # Check complete names too: binary trees store path components separately.
            for name in git(root, 'ls-tree', '-rz', '--name-only', sha).split(b'\0'):
                check('Git filename', name)
    logs = Path(git(root, 'rev-parse', '--git-path', 'logs').decode().strip())
    if not logs.is_absolute():
        logs = Path(root) / logs
    if logs.exists():
        for path in logs.rglob('*'):
            if path.is_file():
                check('Git reflog', path.read_bytes())
    return commits, len(objects)


def scan_release_files(directory):
    archives = 0
    for path in sorted(Path(directory).glob('*')):
        if not path.is_file():
            continue
        check(path.name, path.read_bytes())
        if path.suffix in ('.xpi', '.zip'):
            archives += 1
            with ZipFile(path) as archive:
                check('Archive comment', archive.comment)
                for entry in archive.infolist():
                    check(entry.filename, archive.read(entry))
                    check('Archive metadata', entry.comment + entry.extra)
    return archives


def main():
    commits, objects = scan_history(ROOT)
    archives = scan_release_files(ROOT / 'dist')
    print(f'History identities and sensitive-material scan passed: {commits} commits, '
          f'{objects} Git objects, {archives} archives; binary assets and release metadata included.')


if __name__ == '__main__':
    main()
