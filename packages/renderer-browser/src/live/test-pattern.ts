import { useState } from 'react';
import {
  TestPatternSchema,
  TestPatternPresetSchema,
  type TestPatternConfig,
  type ResolvedLiveProject,
} from '@setcast/core';
import { downloadJson } from './diagnostics.tsx';

export function useTestPattern(initial: ResolvedLiveProject, report: (message: string) => void) {
  const [config, setConfig] = useState(
    () => initial.live.testPattern ?? TestPatternSchema.parse({}),
  );
  const [active, show] = useState(false);
  const change = (patch: Partial<TestPatternConfig>) => {
    const parsed = TestPatternSchema.safeParse({ ...config, ...patch });
    if (!parsed.success) {
      report(parsed.error.issues[0]!.message);
      return;
    }
    setConfig(parsed.data);
  };
  const upload = async (file: File) => {
    try {
      if (file.size > 8192)
        throw new Error('Test pattern preset exceeds 8 KiB. Import a preset exported by Setcast.');
      const preset = TestPatternPresetSchema.safeParse(JSON.parse(await file.text()));
      if (!preset.success)
        throw new Error(preset.error.issues.map((issue) => issue.message).join(' '));
      setConfig(preset.data.testPattern);
      show(false);
    } catch (error) {
      report(
        `Cannot import test pattern preset: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
  return {
    config,
    active,
    show,
    change,
    upload,
    alignment: active && config.pattern === 'alignment',
    showAlignment: (enabled: boolean) => {
      if (enabled) change({ pattern: 'alignment' });
      show(enabled);
    },
    download: () => downloadJson('setcast-test-pattern.json', { version: 1, testPattern: config }),
  };
}

export type LiveTestPattern = ReturnType<typeof useTestPattern>;
