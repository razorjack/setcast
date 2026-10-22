import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { parse, stringify } from 'yaml';
import { readSession, replayEvents, SetcastError } from '@setcast/core';
import {
  audioDuration,
  loadProject,
  sceneDirectory,
  copySceneDirectory,
  loadLiveProject,
} from '@setcast/core/node';
import { themes } from '@setcast/themes';
import { parseCommandArgs } from '../args.ts';
import { intro, log } from '../ui.ts';

export const help = `setcast replay <journal.jsonl> --audio <master.wav> --offset <seconds>

Create a recorded project from one live journal and a separately recorded master.
--offset is the master-file time corresponding to journal time zero. It may be negative.
The new replay-* directory is placed next to the journal. Originals are unchanged.
Credits, cues and saved scene changes are restored. Capture is not an audio recording.
Nondefault input gain/delay requires manual reconciliation and is rejected.`;

export async function run(argv: string[]) {
  const { journalPath, audioPath, offset } = replayOptions(argv);
  intro('replay');
  const journal = await realpath(journalPath);
  const audio = await realpath(audioPath);
  const { header, events } = readSession(await readFile(journal, 'utf8'));
  const duration = await audioDuration(audio);
  const replay = replayEvents(header, events, offset, duration);
  if (!replay.scenes.length)
    throw new SetcastError(
      'The journal has no scene inside the recording.',
      'Record a scene and check --offset before replaying.',
    );
  const output = await mkdtemp(join(dirname(journal), 'replay-'));
  try {
    const master = `assets/master${extname(audio) || '.audio'}`;
    await mkdir(join(output, 'assets'));
    await copyFile(audio, join(output, master));
    await copyScenes(
      dirname(journal),
      output,
      replay.scenes,
      offset - header.originSample / header.sampleRate,
    );
    const config = {
      ...(await initialAppearance(output, replay.scenes[0]!.preset)),
      audio: master,
      plays: replay.plays,
      annotations: replay.annotations,
      scenes: replay.scenes,
      automation: replay.automation,
      panel: { dwell: 0 },
    };
    await writeFile(join(output, 'setcast.yaml'), stringify(config));
    await loadProject(output, { themes, probeDuration: async () => duration });
    log.success(`Created ${output}. Use setcast play or setcast render on this directory.`);
  } catch (error) {
    await rm(output, { recursive: true, force: true });
    throw error;
  }
}

async function copyScenes(
  root: string,
  output: string,
  scenes: { at: number; preset: string }[],
  shift: number,
) {
  for (const [index, scene] of scenes.entries()) {
    const source = await sceneDirectory(root, scene.preset);
    const config = parse(await readFile(join(source, 'live.yaml'), 'utf8'));
    const { project } = await loadLiveProject(source, { themes });
    if (project.live.input.gain !== 1 || project.live.input.delay !== 0)
      throw new SetcastError(
        `Scene ${scene.preset} uses capture gain or visual delay.`,
        'Reconcile those settings with the recorded master before replay. This prototype supports gain: 1 and delay: 0.',
      );
    if (project.bpm) {
      const bar = 240 / project.bpm;
      config.beatOffset = (((project.beatOffset + shift) % bar) + bar) % bar;
    }
    const target = `scenes/${index}`;
    await copySceneDirectory(source, join(output, target));
    await writeFile(join(output, target, 'live.yaml'), stringify(config));
    scene.preset = target;
  }
  scenes[0]!.at = 0;
}

async function initialAppearance(root: string, preset: string) {
  const { project } = await loadLiveProject(join(root, preset), { themes });
  await writeFile(join(root, `${project.theme}.css`), project.css);
  return {
    theme: `./${project.theme}.css`,
    title: project.title,
    background: project.background ? `${preset}/${project.background}` : undefined,
    backgroundFit: project.backgroundFit,
    bpm: project.bpm ?? undefined,
    beatOffset: project.beatOffset,
    visualizer: project.visualizers,
    modulation: project.modulation,
    performance: project.performance,
    output: { width: project.width, height: project.height, fps: project.fps, file: 'set.mp4' },
  };
}

function replayOptions(argv: string[]) {
  const { values, positionals } = parseCommandArgs(
    argv,
    { audio: { type: 'string' }, offset: { type: 'string' } },
    help,
  );
  const offset = Number(values.offset);
  if (!positionals[0] || !values.audio || !values.offset?.trim() || !Number.isFinite(offset)) {
    throw new SetcastError(
      'Replay needs a journal, --audio and a finite --offset.',
      'Use --offset 0 only when the master and journal started together.',
    );
  }
  return { journalPath: positionals[0], audioPath: values.audio, offset };
}
