"""Capture listing images from the production CSS bundle and synthetic fixture."""
import argparse
import tempfile
from pathlib import Path
from test_support.firefox_harness import (
    default_firefox_bin, execute_async, firefox_session, get_available_port,
    navigate, save_screenshot, serve_directory,
)

SCRIPT = r'''
const done = arguments[arguments.length - 1];
(async () => {
  const until = async (condition) => {
    const deadline = performance.now() + 15000;
    while (!await condition()) {
      if (performance.now() > deadline) throw new Error('Synthetic listing fixture did not become ready');
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  };
  await until(async () => (await window.__assSubtitleHarnessListener({type:'ASS_SUBTITLE_PING'})).status?.rendererReady);
  await document.fonts.ready;
  const video = document.querySelector('video');
  video.pause();
  video.controls = false;
  await window.__assSubtitleHarnessListener({type:'ASS_SUBTITLE_SET_DELAY', delay:video.currentTime - 4});
  await until(() => document.querySelectorAll('.ass-subtitle-loader-dom-comment').length === 5);
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  return {ready:true, height:innerHeight};
})().then(done, () => done({ready:false}));
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--firefox-bin', default=default_firefox_bin())
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    output = root / 'docs' / 'screenshots'
    output.mkdir(parents=True, exist_ok=True)
    with serve_directory(root, get_available_port()) as base:
        with tempfile.TemporaryDirectory(prefix='amo-synthetic-profile-') as profile:
            with firefox_session(args.firefox_bin, profile, get_available_port()) as client:
                navigate(client, base + '/test/harness.html?file=amo-danmaku.ass')
                result = execute_async(client, SCRIPT)
                if not result.get('ready'):
                    raise AssertionError('Synthetic listing screenshot was not ready')
                rect = client.command('WebDriver:GetWindowRect')
                client.command('WebDriver:SetWindowRect', {'width':1280, 'height':rect['height'] + 800 - result['height']})
                execute_async(client, 'const done=arguments[arguments.length-1]; requestAnimationFrame(()=>requestAnimationFrame(()=>done(true)));')
                save_screenshot(client, output / 'amo-danmaku.png')
                execute_async(client, "const done=arguments[arguments.length-1]; window.__assSubtitleHarnessListener({type:'ASS_SUBTITLE_SHOW_PICKER'}).then(()=>requestAnimationFrame(()=>done(true)));")
                save_screenshot(client, output / 'amo-picker.png')
    print('Captured two synthetic AMO screenshots; no personal browser profile used.')


if __name__ == '__main__':
    main()
