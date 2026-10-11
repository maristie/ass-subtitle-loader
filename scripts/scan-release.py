"""Scan all new history and release archives; print only counts on success."""
import re,subprocess,sys
from pathlib import Path
from zipfile import ZipFile
ROOT=Path(__file__).resolve().parents[1]
# Match concrete credential shapes, private keys, and unintended personal paths.
patterns=[r'gh[pousr]_[A-Za-z0-9]{30,}',r'github_pat_[A-Za-z0-9_]{30,}',r'AKIA[A-Z0-9]{16}',r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',r'/'+'Users'+r'/[^\s\"\']+',r'/'+'home'+r'/[^\s\"\']+']
combined=re.compile('|'.join(patterns))
def check(name,data):
    if name.endswith(('.png','.otf','.webm')):return
    text=data.decode('utf-8',errors='ignore')
    if combined.search(text):raise AssertionError('Sensitive material scan failed')
def main():
    commits=subprocess.check_output(['git','rev-list','--all'],cwd=ROOT,text=True).splitlines()
    for commit in commits:
        identities=subprocess.check_output(['git','show','-s','--format=%an <%ae>%n%cn <%ce>',commit],cwd=ROOT,text=True).splitlines()
        if identities!=['Maristie <me@maristie.com>']*2:raise AssertionError('Unexpected commit identity')
        for record in subprocess.check_output(['git','ls-tree','-rz',commit],cwd=ROOT).split(b'\0'):
            if not record:continue
            meta,name=record.split(b'\t');sha=meta.split()[2]
            check(name.decode(),subprocess.check_output(['git','cat-file','blob',sha.decode()],cwd=ROOT))
    archives=list((ROOT/'dist').glob('*.xpi'))+list((ROOT/'dist').glob('*.zip'))
    for path in archives:
        with ZipFile(path) as archive:
            for name in archive.namelist():check(name,archive.read(name))
    print(f'History identities and sensitive-material scan passed: {len(commits)} commits, {len(archives)} archives.')
if __name__=='__main__':main()
