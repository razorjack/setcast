import { intro, note, outro } from '../ui.ts';

export const analyzeHelp = `setcast analyze [dir]

(Planned) Analyzes the audio: beats, onsets, BPM, and automatic drop detection → draft events.`;

export async function analyze(): Promise<void> {
  intro('analyze');
  note(
    [
      'Not built yet. Planned: beat / onset / BPM detection and automatic drop',
      'detection that writes draft `events:` into setcast.yaml for you to review.',
      '',
      'Today: add events by hand, e.g.',
      '  events:',
      '    - type: drop',
      '      time: 1:04',
    ].join('\n'),
    'analyze',
  );
  outro('See AGENTS.md → Roadmap.');
}

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
