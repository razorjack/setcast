import { describe, expect, test } from 'vite-plus/test';
import { OutputSchema, ProjectConfigSchema } from './config.ts';

describe('video encoding settings', () => {
  test('preserves software quality defaults for omitted and empty output blocks', () => {
    for (const input of [{ audio: 'mix.wav' }, { audio: 'mix.wav', output: {} }]) {
      expect(ProjectConfigSchema.parse(input).output).toMatchObject({
        hardwareAcceleration: 'disable',
        crf: 18,
        jpegQuality: 95,
        profile: 'standard',
        parallelEncoding: true,
        x264Preset: 'medium',
      });
    }
    expect(OutputSchema.parse({ crf: 22 }).crf).toBe(22);
  });

  test('accepts an explicit serial encoder without coercing invalid values', () => {
    expect(OutputSchema.parse({ parallelEncoding: false }).parallelEncoding).toBe(false);
    expect(() => OutputSchema.parse({ parallelEncoding: 'false' })).toThrow(
      'parallelEncoding must be true or false. Use false to encode after capture.',
    );
  });

  test('fast changes capture quality and compression effort without changing timing or CRF', () => {
    const output = OutputSchema.parse({ profile: 'fast' });
    expect(output).toMatchObject({
      width: 1920,
      height: 1080,
      fps: 30,
      crf: 18,
      jpegQuality: 92,
      x264Preset: 'veryfast',
    });
    expect(OutputSchema.parse(output)).toEqual(output);
    expect(
      OutputSchema.parse({ profile: 'fast', jpegQuality: 98, x264Preset: 'slow', crf: 20 }),
    ).toMatchObject({ jpegQuality: 98, x264Preset: 'slow', crf: 20 });
  });

  test('hardware encoding uses fast capture quality without a software preset', () => {
    const output = OutputSchema.parse({
      profile: 'fast',
      hardwareAcceleration: 'if-possible',
      videoBitrate: '12M',
    });
    expect(output.jpegQuality).toBe(92);
    expect(output.x264Preset).toBeUndefined();
    expect(OutputSchema.parse(output)).toEqual(output);
    expect(() => OutputSchema.parse({ ...output, x264Preset: 'veryfast' })).toThrow(
      'Remove x264Preset',
    );
  });

  test('reports invalid profile and software preset names', () => {
    expect(() => OutputSchema.parse({ profile: 'draft' })).toThrow(
      'profile must be standard or fast',
    );
    expect(() => OutputSchema.parse({ x264Preset: 'quick' })).toThrow('x264Preset must be');
  });

  test.each(['disable', 'if-possible', 'required'] as const)(
    'accepts bitrate encoding with hardwareAcceleration: %s without injecting CRF',
    (hardwareAcceleration) => {
      const output = OutputSchema.parse({ hardwareAcceleration, videoBitrate: '12M' });
      expect(output).toMatchObject({ hardwareAcceleration, videoBitrate: '12M' });
      expect(output.crf).toBeUndefined();
      expect(OutputSchema.parse(output)).toEqual(output);
    },
  );

  test.each(['12M', '12000k', '12000K', '0.5M', '.5M'])(
    'accepts a positive bitrate: %s',
    (videoBitrate) => {
      expect(OutputSchema.parse({ videoBitrate }).videoBitrate).toBe(videoBitrate);
    },
  );

  test.each([0, 12000, '', '12', '12Mbps', '12m', '0M', '0.0k', '-5M', 'InfinityM', '12 M'])(
    'rejects an invalid bitrate: %s',
    (videoBitrate) => {
      const result = OutputSchema.safeParse({ videoBitrate });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]).toMatchObject({
          path: ['videoBitrate'],
          message: expect.stringContaining('positive bitrate'),
        });
      }
    },
  );

  test.each(['if-possible', 'required'] as const)(
    'requires an explicit bitrate when hardwareAcceleration is %s',
    (hardwareAcceleration) => {
      expect(() => OutputSchema.parse({ hardwareAcceleration })).toThrow('Set videoBitrate');
    },
  );

  test.each([
    { crf: 18, videoBitrate: '12M' },
    { crf: 18, hardwareAcceleration: 'required', videoBitrate: '12M' },
    { crf: 18, hardwareAcceleration: 'if-possible' },
  ])('rejects conflicting quality controls: %j', (output) => {
    expect(() => OutputSchema.parse(output)).toThrow('Remove crf');
  });

  test('reports invalid acceleration modes and misspelled bitrate keys', () => {
    expect(() => OutputSchema.parse({ hardwareAcceleration: true })).toThrow(
      'must be disable, if-possible or required',
    );
    const result = OutputSchema.safeParse({ videoBitRate: '12M' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('Did you mean "videoBitrate"');
    }
  });
});
