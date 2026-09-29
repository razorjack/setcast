const { env } = process;

/**
 * Whether the terminal draws OSC 9;4 progress in its tab or taskbar. The list follows cargo's
 * (the anstyle-progress crate): other terminals read OSC 9 as a desktop notification.
 */
function drawsTabProgress(): boolean {
  if (!process.stdout.isTTY) return false;
  if (env.TERM_PROGRAM === 'ghostty' || env.TERM_PROGRAM === 'WezTerm') return true;
  if (env.WT_SESSION !== undefined || env.ConEmuANSI === 'ON') return true;
  if (iTermFeatures().includes('P')) return true;
  return Number(env.PTYXIS_VERSION?.split('.')[0]) >= 48 || Number(env.KONSOLE_VERSION) >= 260400;
}

/** iTerm2 3.6.6+ lists what it supports in `TERM_FEATURES`: `AbCdEf12GH` is Ab, Cd, Ef, G and H. */
function iTermFeatures(): string[] {
  const alphanumeric = /^[A-Za-z\d]*/.exec(env.TERM_FEATURES ?? '')![0];
  return alphanumeric.match(/[A-Z][a-z]*/g) ?? [];
}

const tabProgress = drawsTabProgress();
let clearsOnExit = false;

/** Fills the tab's progress indicator to `fraction`, 0..1. */
export const showTabProgress = (fraction: number) =>
  writeTabProgress(1, String(Math.round(fraction * 100)));

/** An indeterminate indicator, for work that reports no progress. */
export const showTabBusy = () => writeTabProgress(3);

export const clearTabProgress = () => writeTabProgress(0);

function writeTabProgress(state: 0 | 1 | 3, percent = ''): void {
  if (!tabProgress) return;
  if (!clearsOnExit) {
    // Remotion exits on Ctrl+C mid-render; the tab would otherwise keep the last percentage.
    process.once('exit', clearTabProgress);
    clearsOnExit = true;
  }
  process.stdout.write(`\x1b]9;4;${state};${percent}\x1b\\`);
}
