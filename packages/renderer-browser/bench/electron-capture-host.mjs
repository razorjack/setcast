import { app, BrowserWindow } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const config = JSON.parse(await readFile(process.argv[2], 'utf8'));
app.setPath('userData', join(config.out, 'electron-profile'));
for (const argument of config.args) {
  const [name, ...value] = argument.slice(2).split('=');
  app.commandLine.appendSwitch(name, value.join('='));
}
app.commandLine.appendSwitch('force-device-scale-factor', '1');
// Windows are replaced between fixtures; only run() ends the research process.
app.on('window-all-closed', () => {});
const report = {
  capture: config.capture ?? 'page',
  versions: process.versions,
  samples: [],
  status: 'running',
};
void run();

async function run() {
  try {
    await app.whenReady();
    app.dock?.hide();
    for (const job of config.jobs) await captureJob(job);
    report.status = 'measured';
  } catch (error) {
    report.status = 'failed';
    report.error = String(error.stack ?? error);
  } finally {
    await writeFile(join(config.out, 'electron-report.json'), JSON.stringify(report, null, 2));
    app.exit(report.status === 'measured' ? 0 : 1);
  }
}

async function captureJob(job) {
  if (new URL(job.url).hostname !== '127.0.0.1')
    throw new Error('Capture research accepts localhost fixtures only.');
  const directory = join(config.out, job.id);
  await mkdir(directory, { recursive: true });
  const window = new BrowserWindow({
    width: job.width,
    height: job.height,
    show: false,
    webPreferences: {
      offscreen: { useSharedTexture: false, deviceScaleFactor: 1 },
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  const contents = window.webContents;
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  );
  contents.setFrameRate(240);
  try {
    await contents.loadURL(job.url);
    await contents.executeJavaScript(`(async () => {
      const end = Date.now() + 30000;
      while (!window.setcastExport) {
        if (Date.now() > end) throw new Error('Export driver did not initialize.');
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    })()`);
    contents.debugger.attach('1.3');
    for (const [index, frame] of job.frames.entries()) {
      await deadline(captureFrame(contents, job, { directory, index, frame }), `Frame ${frame}`);
    }
  } finally {
    window.destroy();
  }
}

async function captureFrame(contents, job, { directory, index, frame }) {
  const completed = await contents.executeJavaScript(`window.setcastExport.frame(${frame})`);
  if (completed !== frame) throw new Error(`Requested ${frame}, completed ${completed}.`);
  const start = performance.now();
  const image =
    config.capture === 'paint'
      ? await paintFrame(contents)
      : await contents.capturePage(undefined, { stayHidden: true, stayAwake: true });
  const bitmap = image.toBitmap({ scaleFactor: 1 });
  const captureMs = performance.now() - start;
  if (
    image.getSize().width !== job.width ||
    image.getSize().height !== job.height ||
    bitmap.length !== job.width * job.height * 4
  )
    throw new Error(
      `Native bitmap dimensions differ: ${JSON.stringify(image.getSize())}, ${bitmap.length} bytes.`,
    );
  const reference = await contents.debugger.sendCommand('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await writeFile(join(directory, `${index}.bgra`), bitmap);
  await writeFile(join(directory, `${index}-native.png`), image.toPNG());
  await writeFile(join(directory, `${index}-cdp.png`), Buffer.from(reference.data, 'base64'));
  report.samples.push({
    id: job.id,
    frame,
    index,
    size: image.getSize(),
    captureMs,
    bytes: bitmap.length,
  });
  await writeFile(join(config.out, 'electron-report.json'), JSON.stringify(report, null, 2));
}

function paintFrame(contents) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      contents.removeListener('paint', painted);
      reject(new Error('Native repaint exceeded 30 seconds.'));
    }, 30000);
    const painted = (_event, _dirty, image) => {
      clearTimeout(timer);
      resolve(image);
    };
    contents.once('paint', painted);
    contents.invalidate();
  });
}

async function deadline(task, label) {
  let timer;
  try {
    return await Promise.race([
      task,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} exceeded 60 seconds.`)), 60000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
