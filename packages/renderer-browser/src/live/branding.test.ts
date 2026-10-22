import { expect, test } from 'vite-plus/test';
import { BrandingSchema } from '@setcast/core';
import { editBranding, toggleBranding } from './branding.ts';

const configured = BrandingSchema.parse({
  logo: 'logo.svg',
  name: 'Null Vector',
  messages: { lines: ['instagram.com/nullvector'] },
});

test('operator edits validate like live.yaml and empty fields remove lines', () => {
  expect(editBranding(null, { name: '', event: ' ' })).toBeNull();
  expect(editBranding(null, { name: 'Guest' })).toMatchObject({
    name: 'Guest',
    position: 'top-right',
    visible: true,
  });
  const edited = editBranding(configured, { name: '', episode: '42', position: 'bottom' });
  expect(edited).toMatchObject({ logo: 'logo.svg', episode: '42', position: 'bottom' });
  expect(edited).not.toHaveProperty('name');
  expect(() => editBranding(configured, { size: 9 })).toThrow('branding.size must be a number');
});

test('toggles keep settings and ignore missing parts', () => {
  expect(toggleBranding(null, 'visible')).toBeNull();
  expect(toggleBranding(configured, 'visible')).toMatchObject({
    visible: false,
    name: 'Null Vector',
  });
  expect(toggleBranding(configured, 'messages')?.messages).toMatchObject({ visible: false });
  const withoutMessages = BrandingSchema.parse({ name: 'A' });
  expect(toggleBranding(withoutMessages, 'messages')).toBe(withoutMessages);
});
