import { describe, expect, test } from 'vite-plus/test';
import {
  AnnouncementsSchema,
  BrandingSchema,
  endAnnouncement,
  logoEnlargement,
  messageAt,
  showsIdentity,
} from './branding.ts';

const branding = (input: unknown) => BrandingSchema.parse(input);
const firstError = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues[0]?.message;

describe('BrandingSchema', () => {
  test('fills defaults and keeps an episode number as written', () => {
    expect(branding({ name: 'Null Vector', episode: 42 })).toEqual({
      name: 'Null Vector',
      episode: '42',
      position: 'top-right',
      size: 1,
      opacity: 1,
      visible: true,
    });
    expect(branding({ messages: { lines: ['a'] } }).messages).toEqual({
      lines: ['a'],
      seconds: 8,
      gap: 20,
      position: 'bottom',
      size: 1,
      visible: true,
    });
  });

  test.each([
    [{ logo: 'logo.gif' }, 'PNG, JPEG, WebP or SVG'],
    [{ position: 'middle' }, 'branding.position must be top-left, top,'],
    [{ size: 9 }, 'branding.size must be a number from 0.25 to 4'],
    [{ opacity: 0 }, 'use visible: false to hide'],
    [{ name: '  ' }, 'branding.name cannot be empty'],
    [
      { messages: { lines: ['a'], seconds: 1 } },
      'branding.messages.seconds must be seconds from 3',
    ],
    [{ messages: { line: ['a'] } }, 'branding.messages takes lines, seconds'],
    [{ title: 'x' }, 'branding takes logo, name, event, episode'],
  ])('reports %j', (input, message) => {
    expect(firstError(BrandingSchema.safeParse(input))).toContain(message);
  });

  test('announcements must be ordered', () => {
    const result = AnnouncementsSchema.safeParse([
      { at: 20, text: 'b' },
      { at: 10, text: 'a' },
    ]);
    expect(firstError(result)).toContain('ordered by at');
  });
});

test('showsIdentity needs visible content', () => {
  expect(showsIdentity(null)).toBe(false);
  expect(showsIdentity(branding({ messages: { lines: ['a'] } }))).toBe(false);
  expect(showsIdentity(branding({ name: 'A', visible: false }))).toBe(false);
  expect(showsIdentity(branding({ logo: 'logo.svg' }))).toBe(true);
});

describe('messageAt', () => {
  const rotating = branding({ messages: { lines: ['one', 'two'], seconds: 4, gap: 6 } });

  test('rotates lines after each gap and fades at both ends', () => {
    expect(messageAt(rotating, [], 3)).toBeNull();
    expect(messageAt(rotating, [], 6.3)).toMatchObject({
      text: 'one',
      presence: expect.closeTo(0.5),
    });
    expect(messageAt(rotating, [], 8)).toMatchObject({
      text: 'one',
      presence: expect.closeTo(1),
      index: 0,
    });
    expect(messageAt(rotating, [], 9.7)).toMatchObject({
      text: 'one',
      presence: expect.closeTo(0.5),
    });
    expect(messageAt(rotating, [], 12)).toBeNull();
    expect(messageAt(rotating, [], 18)).toMatchObject({ text: 'two', index: 1 });
    expect(messageAt(rotating, [], 28)).toMatchObject({ text: 'one', index: 0 });
  });

  test('hidden or empty messages show nothing', () => {
    const hidden = branding({ messages: { lines: ['one'], visible: false, gap: 0 } });
    expect(messageAt(hidden, [], 2)).toBeNull();
    expect(messageAt(branding({ messages: {} }), [], 2)).toBeNull();
  });

  test('the latest announcement replaces the message while it lasts', () => {
    const announcements = [
      { at: 7, text: 'first', seconds: 10 },
      { at: 9, text: 'second', seconds: 2 },
    ];
    expect(messageAt(rotating, announcements, 8)).toMatchObject({
      kind: 'announcement',
      text: 'first',
    });
    expect(messageAt(rotating, announcements, 9.6)).toMatchObject({
      text: 'second',
      presence: expect.closeTo(1),
      index: 1,
    });
    expect(messageAt(null, announcements, 10.7)).toMatchObject({ text: 'second' });
    expect(messageAt(rotating, announcements, 11)).toBeNull();
    expect(messageAt(rotating, announcements, 18)).toMatchObject({ kind: 'message' });
  });
});

test('endAnnouncement fades the visible announcement out from now', () => {
  const announcements = [{ at: 10, text: 'live', seconds: 30 }];
  const ended = endAnnouncement(announcements, 15);
  expect(ended).toEqual([{ at: 10, text: 'live', seconds: 5.6 }]);
  expect(messageAt(null, ended, 15)).toMatchObject({ presence: expect.closeTo(1) });
  expect(messageAt(null, ended, 15.6)).toBeNull();
  expect(endAnnouncement(announcements, 45)).toEqual(announcements);
  expect(endAnnouncement(announcements, 5)).toEqual(announcements);
});

test('logoEnlargement uses the logo box on the short side', () => {
  const frame = { width: 1920, height: 1080 };
  expect(logoEnlargement({ width: 100, height: 43.2 }, frame, 1)).toBeCloseTo(2);
  expect(logoEnlargement({ width: 2000, height: 100 }, frame, 1)).toBeCloseTo(0.1296);
  expect(
    logoEnlargement({ width: 1080, height: 1080 }, { width: 1080, height: 1920 }, 2),
  ).toBeCloseTo(0.16);
});
