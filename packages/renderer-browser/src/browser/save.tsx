import { useState } from 'react';
import type { SceneSelection } from '@setcast/core';
import type { Art } from './overrides.ts';

const uploads = new WeakMap<Art, Promise<string | undefined>>();

export function uploadArt(art: Art): Promise<string | undefined> {
  const existing = uploads.get(art);
  if (existing) return existing;
  const pending = upload(art);
  uploads.set(art, pending);
  void pending.catch(() => uploads.delete(art));
  return pending;
}

async function upload(art: Art): Promise<string | undefined> {
  if (art.kind !== 'file') return undefined;
  const blob = await (await fetch(art.url)).blob();
  const uploaded = await playerWrite(`/art?name=${encodeURIComponent(art.name)}`, blob);
  return uploaded.path;
}

export async function playerWrite(path: string, body: BodyInit) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'X-Setcast-Player': '1' },
    body,
  });
  const saved = await response.json();
  if (!response.ok)
    throw new Error(saved.message ?? 'Cannot save. Check the project directory permissions.');
  return saved;
}

export function SaveScene({
  selection,
  art,
  report,
}: {
  selection: Omit<SceneSelection, 'art'>;
  art: Art;
  report: (message: string, failed?: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const artwork = await uploadArt(art);
      const saved = await playerWrite(
        '/save',
        JSON.stringify({ ...selection, art: art.kind, artwork }),
      );
      window.dispatchEvent(new Event('setcast-scenes-changed'));
      report(
        `Saved ${saved.directory}/${saved.config}. Open that directory with setcast ${saved.config === 'live.yaml' ? 'live' : 'play or render'}.`,
      );
    } catch (error) {
      report(error instanceof Error ? error.message : String(error), true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      className="sc-button"
      disabled={busy}
      onClick={() => void save()}
      title="Save a project copy with this scene and its media"
    >
      {busy ? 'Saving…' : 'Save scene'}
    </button>
  );
}
