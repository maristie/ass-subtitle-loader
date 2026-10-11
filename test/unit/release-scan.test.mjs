import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

function python(body) {
  const result = spawnSync('python3', ['-c', `
import importlib.util, os, subprocess, tempfile, zlib
from pathlib import Path
from zipfile import ZipFile
spec = importlib.util.spec_from_file_location('release_scan', 'scripts/scan-release.py')
scan = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scan)
secret = 'ghp_' + 'A' * 36
${body}
`], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
}

test('release scanner detects binary, UTF-16, filename, and compressed PNG leaks', () => python(`
for name, data in [('font.otf', b'\\0' + secret.encode()), ('video.webm', secret.encode('utf-16le')),
                   (secret + '.png', b''), ('image.png', b'\\x89PNG\\r\\n\\x1a\\n' +
                    len(b'Note\\0\\0' + zlib.compress(secret.encode())).to_bytes(4, 'big') +
                    b'zTXt' + b'Note\\0\\0' + zlib.compress(secret.encode()) + b'\\0' * 4)]:
    try:
        scan.check(name, data)
    except AssertionError as error:
        assert secret not in str(error)
    else:
        raise AssertionError('Expected synthetic leak detection')
scan.check('synthetic.png', b'\\0synthetic harmless asset')
`));

test('release scanner includes dangling Git objects and rejects unintended commit identities', () => python(`
with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    subprocess.run(['git', 'init', '-q', directory], check=True)
    tree = subprocess.check_output(['git', 'mktree'], cwd=root, input=b'').strip().decode()
    env = dict(os.environ, GIT_AUTHOR_NAME='Maristie', GIT_AUTHOR_EMAIL='me@maristie.com',
               GIT_COMMITTER_NAME='Maristie', GIT_COMMITTER_EMAIL='me@maristie.com')
    subprocess.run(['git', 'commit-tree', tree], cwd=root, env=env, input=b'Synthetic commit', check=True, stdout=subprocess.DEVNULL)
    assert scan.scan_history(root)[0] == 1
    subprocess.run(['git', 'hash-object', '-w', '--stdin'], cwd=root, input=secret.encode(), check=True, stdout=subprocess.DEVNULL)
    try:
        scan.scan_history(root)
    except AssertionError:
        pass
    else:
        raise AssertionError('Dangling sensitive blob was omitted')
with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    subprocess.run(['git', 'init', '-q', directory], check=True)
    tree = subprocess.check_output(['git', 'mktree'], cwd=root, input=b'').strip().decode()
    env['GIT_AUTHOR_NAME'] = 'Synthetic other author'
    subprocess.run(['git', 'commit-tree', tree], cwd=root, env=env, input=b'Synthetic commit', check=True, stdout=subprocess.DEVNULL)
    try:
        scan.scan_history(root)
    except AssertionError as error:
        assert 'Unexpected commit identity' in str(error)
    else:
        raise AssertionError('Unexpected identity was omitted')
`));

test('release scanner checks archive comments and non-archive release outputs', () => python(`
with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    with ZipFile(root / 'synthetic.zip', 'w') as archive:
        archive.writestr('safe.txt', 'synthetic')
        archive.comment = secret.encode()
    try:
        scan.scan_release_files(root)
    except AssertionError:
        pass
    else:
        raise AssertionError('Archive metadata was omitted')
    (root / 'synthetic.zip').unlink()
    (root / 'inventory.json').write_text(secret)
    try:
        scan.scan_release_files(root)
    except AssertionError:
        pass
    else:
        raise AssertionError('Release metadata was omitted')
`));
