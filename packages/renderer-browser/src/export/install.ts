import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { SetcastError } from '@setcast/core';

export function installBrowser() {
  const require = createRequire(import.meta.url);
  const manifest = require.resolve('playwright/package.json');
  const cli = resolve(dirname(manifest), require(manifest).bin.playwright);
  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [cli, 'install', 'chromium'], { stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0
        ? resolve()
        : reject(
            new SetcastError(
              'Chromium installation failed.',
              'Check network access and the installer output, then retry.',
              { exitCode: 1 },
            ),
          ),
    );
  });
}
