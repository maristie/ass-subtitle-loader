"""Rebuild a fresh Git clone and the reviewer ZIP; compare runtime file bytes."""
import subprocess,tempfile
from pathlib import Path
from zipfile import ZipFile
ROOT=Path(__file__).resolve().parents[1]
def contents(path):
    with ZipFile(path) as archive:return {name:archive.read(name) for name in archive.namelist()}
def rebuild(directory,expected):
    subprocess.run(['npm','ci'],cwd=directory,check=True,stdout=subprocess.DEVNULL)
    subprocess.run(['npm','run','package'],cwd=directory,check=True,stdout=subprocess.DEVNULL)
    if contents(directory/'dist/ass-subtitle-loader-0.2.0-unsigned.xpi')!=expected:raise AssertionError('Runtime files differ')
def main():
    expected=contents(ROOT/'dist/ass-subtitle-loader-0.2.0-unsigned.xpi')
    with tempfile.TemporaryDirectory(prefix='css-reproducibility-') as temp:
        clone=Path(temp)/'clone';subprocess.run(['git','clone','--quiet','--no-local',str(ROOT),str(clone)],check=True)
        rebuild(clone,expected)
        source=Path(temp)/'source';source.mkdir()
        with ZipFile(ROOT/'dist/ass-subtitle-loader-0.2.0-source.zip') as archive:archive.extractall(source)
        rebuild(source,expected)
    print('Fresh clone and reviewer archive reproduce every runtime byte.')
if __name__=='__main__':main()
