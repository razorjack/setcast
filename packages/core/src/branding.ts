import { z } from 'zod';
import { clamp } from './motion.ts';
import { TimeSchema } from './time-schema.ts';

/** The frame areas branding can occupy, named like the calm areas of the art. */
export const BRAND_POSITIONS = [
  'top-left',
  'top',
  'top-right',
  'left',
  'center',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
] as const;
export type BrandPosition = (typeof BRAND_POSITIONS)[number];

/** Seconds a message or announcement takes to fade in, and again to fade out. */
export const MESSAGE_FADE_SECONDS = 0.6;

const positionError = (key: string) =>
  `${key} must be ${BRAND_POSITIONS.slice(0, -1).join(', ')} or bottom-right.`;
const position = (key: string, fallback: BrandPosition) =>
  z.enum(BRAND_POSITIONS, { error: positionError(key) }).default(fallback);

const sizeError = (key: string) => `${key} must be a number from 0.25 to 4; 1 is the default size.`;
const size = (key: string) =>
  z
    .number({ error: sizeError(key) })
    .min(0.25, { error: sizeError(key) })
    .max(4, { error: sizeError(key) })
    .default(1);

const text = (key: string, maximum: number) =>
  z
    .string({ error: `${key} must be text.` })
    .trim()
    .min(1, { error: `${key} cannot be empty; remove the key to show nothing.` })
    .max(maximum, { error: `${key} exceeds ${maximum} characters. Shorten it.` });

const seconds = (key: string, minimum: number, maximum: number, fallback: number) => {
  const error = `${key} must be seconds from ${minimum} to ${maximum}.`;
  return z.number({ error }).min(minimum, { error }).max(maximum, { error }).default(fallback);
};

const visible = (key: string) =>
  z.boolean({ error: `${key} must be true or false.` }).default(true);

const LOGO_FORMATS = /\.(?:png|jpe?g|webp|svg)$/i;

const MessagesSchema = z.strictObject(
  {
    lines: z
      .array(text('branding.messages.lines[]', 200), {
        error: 'branding.messages.lines must be a list of text lines.',
      })
      .max(32, { error: 'branding.messages.lines takes at most 32 lines.' })
      .default([]),
    seconds: seconds('branding.messages.seconds', 3, 120, 8),
    gap: seconds('branding.messages.gap', 0, 3600, 20),
    position: position('branding.messages.position', 'bottom'),
    size: size('branding.messages.size'),
    visible: visible('branding.messages.visible'),
  },
  {
    error: (issue) =>
      issue.code === 'unrecognized_keys'
        ? `branding.messages takes lines, seconds, gap, position, size and visible, not ${issue.keys.join(', ')}.`
        : 'branding.messages must be a mapping such as { lines: [instagram.com/you], seconds: 8 }.',
  },
);

export const BrandingSchema = z.strictObject(
  {
    logo: z
      .string({ error: 'branding.logo must be an image path such as assets/logo.png.' })
      .min(1, { error: 'branding.logo path cannot be empty.' })
      .regex(LOGO_FORMATS, {
        error: 'branding.logo must be a PNG, JPEG, WebP or SVG file (.png, .jpg, .webp, .svg).',
      })
      .optional(),
    name: text('branding.name', 120).optional(),
    event: text('branding.event', 120).optional(),
    episode: z
      .union([z.number(), z.string()], {
        error: 'branding.episode must be text such as "Episode 42" or a number.',
      })
      .transform(String)
      .pipe(text('branding.episode', 60))
      .optional(),
    position: position('branding.position', 'top-right'),
    size: size('branding.size'),
    opacity: z
      .number({ error: 'branding.opacity must be a number from 0.1 to 1.' })
      .min(0.1, { error: 'branding.opacity must be at least 0.1; use visible: false to hide.' })
      .max(1, { error: 'branding.opacity must be at most 1.' })
      .default(1),
    visible: visible('branding.visible'),
    messages: MessagesSchema.optional(),
  },
  {
    error: (issue) =>
      issue.code === 'unrecognized_keys'
        ? `branding takes logo, name, event, episode, position, size, opacity, visible and messages, not ${issue.keys.join(', ')}.`
        : 'branding must be a mapping such as { name: Your Name, logo: assets/logo.png }.',
  },
);

export type Branding = z.infer<typeof BrandingSchema>;
export type BrandingInput = z.input<typeof BrandingSchema>;

export const AnnouncementSchema = z.strictObject(
  {
    at: TimeSchema,
    text: text('announcements[].text', 200),
    seconds: seconds('announcements[].seconds', 0.5, 600, 10),
  },
  {
    error: (issue) =>
      issue.code === 'unrecognized_keys'
        ? `Each announcements entry takes at, text and seconds, not ${issue.keys.join(', ')}.`
        : 'Each announcements entry must be a mapping such as {at: 30:00, text: Last hour}.',
  },
);

export const AnnouncementsSchema = z
  .array(AnnouncementSchema, {
    error: 'announcements must be a list of {at, text, seconds} entries.',
  })
  .refine(
    (entries) => entries.every((entry, index) => index === 0 || entry.at >= entries[index - 1]!.at),
    { error: 'announcements must be ordered by at. A later entry replaces an earlier one.' },
  );

export type Announcement = z.infer<typeof AnnouncementSchema>;

/** What the message line shows at one moment. */
export interface BrandMessage {
  kind: 'message' | 'announcement';
  text: string;
  /** 0..1: fades in over `MESSAGE_FADE_SECONDS` and out over the same before it leaves. */
  presence: number;
  /** The line's position in `messages.lines`, or the announcement's position in the list. */
  index: number;
}

/** Whether the identity block (logo, name, event, episode) has anything to show. */
export function showsIdentity(branding: Branding | null): branding is Branding {
  if (!branding?.visible) return false;
  return Boolean(branding.logo || branding.name || branding.event || branding.episode);
}

/** Where the message line sits and how large it is, also when only announcements use it. */
export function messageLayout(branding: Branding | null): {
  position: BrandPosition;
  size: number;
} {
  return {
    position: branding?.messages?.position ?? 'bottom',
    size: branding?.messages?.size ?? 1,
  };
}

/**
 * The line shown at `time`: the latest announcement while it lasts, otherwise the rotating
 * message. Each message shows for `seconds` after a `gap`, in list order, repeating. Both are pure
 * functions of time, so any frame renders on its own.
 */
export function messageAt(
  branding: Branding | null,
  announcements: readonly Announcement[],
  time: number,
): BrandMessage | null {
  const announcement = announcementAt(announcements, time);
  if (announcement) return announcement;
  const messages = branding?.messages;
  if (!messages?.visible || messages.lines.length === 0) return null;

  const cycle = messages.gap + messages.seconds;
  const turn = Math.floor(time / cycle);
  const shown = time - turn * cycle - messages.gap;
  if (shown < 0) return null;
  const index = turn % messages.lines.length;
  return {
    kind: 'message',
    text: messages.lines[index]!,
    presence: presence(shown, messages.seconds),
    index,
  };
}

function announcementAt(announcements: readonly Announcement[], time: number): BrandMessage | null {
  const index = announcements.findLastIndex((entry) => entry.at <= time);
  const announcement = announcements[index];
  if (!announcement) return null;
  const shown = time - announcement.at;
  if (shown >= announcement.seconds) return null;
  return {
    kind: 'announcement',
    text: announcement.text,
    presence: presence(shown, announcement.seconds),
    index,
  };
}

/** A line `shown` seconds into its `duration`, faded at both ends. */
const presence = (shown: number, duration: number) =>
  clamp(Math.min(shown, duration - shown) / MESSAGE_FADE_SECONDS, 0, 1);

/**
 * Ends the announcement visible at `time` there: it fades out from `time`. Returns the list
 * unchanged when nothing is visible.
 */
export function endAnnouncement(
  announcements: readonly Announcement[],
  time: number,
): Announcement[] {
  const index = announcements.findLastIndex((entry) => entry.at <= time);
  const announcement = announcements[index];
  if (!announcement) return [...announcements];
  const shown = time - announcement.at;
  if (shown >= announcement.seconds) return [...announcements];
  const remaining = Math.min(announcement.seconds, shown + MESSAGE_FADE_SECONDS);
  return announcements.map((entry, position) =>
    position === index ? { ...entry, seconds: remaining } : entry,
  );
}

/** The logo's box at size 1, in fractions of the frame's short side; base.css draws the same. */
export const LOGO_HEIGHT = 0.08;
export const LOGO_WIDTH = 0.24;

/** How much the frame enlarges a logo of `image` pixels at `size`; above 1.5 it looks soft. */
export function logoEnlargement(
  image: { width: number; height: number },
  frame: { width: number; height: number },
  size: number,
): number {
  const side = Math.min(frame.width, frame.height) * size;
  return Math.min((side * LOGO_HEIGHT) / image.height, (side * LOGO_WIDTH) / image.width);
}
