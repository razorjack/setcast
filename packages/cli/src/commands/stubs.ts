import { intro, note, outro } from '../ui.ts';

export const liveHelp = `setcast live

(Planned) Live mode: OBS browser-source overlay driven by DJ hardware events.`;

export async function live(): Promise<void> {
  intro('live');
  note(
    [
      'Not built yet. The plan ("stream once, publish twice"):',
      '  1. setcast live serves the same components as an OBS browser source',
      '  2. adapters feed real-time events: Pro DJ Link, StagelinQ, OS2L, MIDI/OSC',
      '  3. every event is appended to event-log.jsonl',
      '  4. setcast render regenerates the polished VOD from the log afterward',
    ].join('\n'),
    'live',
  );
  outro('See AGENTS.md → Roadmap.');
}
