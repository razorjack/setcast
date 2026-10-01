import { describe, expect, test } from 'vite-plus/test';
import { OutputSchema, ProjectConfigSchema } from './config.ts';

describe('video encoding settings', () => {
  test('preserves software quality defaults for omitted and empty output blocks', () => {
    for (const input of [{ audio: 'mix.wav' }, { audio: 'mix.wav', output: {} }]) {
      expect(ProjectConfigSchema.parse(input).output).toMatchObject({
        hardwareAcceleration: 'disable',
        crf: 18,
        jpegQuality: 95,
      });
    }
    expect(OutputSchema.parse({ crf: 22 }).crf).toBe(22);
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
