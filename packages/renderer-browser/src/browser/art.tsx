import { useCallback, useEffect, useRef, useState } from 'react';
import { backgroundKind, type SceneProject } from '@setcast/core';
import type { Art } from './overrides.ts';
import { assetUrl } from './url.ts';
import { UploadIcon } from './icons.tsx';

/**
 * The art the viewer chose. A file stays in the browser as a blob URL; the project and its folder
 * are never changed. Files dropped anywhere on the page replace it too.
 */
export function useArt(report: (message: string) => void) {
  const [art, setArt] = useState<Art>({ kind: 'project' });

  useEffect(() => {
    if (art.kind !== 'file') return;
    return () => URL.revokeObjectURL(art.url);
  }, [art]);

  const choose = useCallback(
    (file: File) => {
      if (!/^(image|video)\//.test(file.type)) {
        report(
          `${file.name} is not an image or a video. Choose a PNG, JPEG, WebP, MP4 or WebM file.`,
        );
        return;
      }
      setArt({ kind: 'file', url: URL.createObjectURL(file), name: file.name });
    },
    [report],
  );
  const dragging = useFileDrop(choose);

  return { art, setArt, choose, dragging };
}

/** Whether files are being dragged over the page; a dropped file goes to `drop`. */
function useFileDrop(dropped: (file: File) => void) {
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    let depth = 0;
    const carriesFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files');
    const enter = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      depth++;
      setDragging(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const over = (event: DragEvent) => {
      if (carriesFiles(event)) event.preventDefault();
    };
    const drop = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setDragging(false);
      const file = event.dataTransfer?.files[0];
      if (file) dropped(file);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, [dropped]);
  return dragging;
}

export function ArtMenu({
  project,
  art,
  setArt,
  choose,
}: {
  project: SceneProject;
  art: Art;
  setArt: (art: Art) => void;
  choose: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="sc-art-menu">
      <ArtPreview project={project} art={art} />
      <div className="sc-art-actions">
        <button className="sc-button sc-button-primary" onClick={() => input.current?.click()}>
          <UploadIcon /> Choose file
        </button>
        {art.kind !== 'project' && (
          <button className="sc-button" onClick={() => setArt({ kind: 'project' })}>
            Use project art
          </button>
        )}
        {art.kind !== 'none' && (
          <button className="sc-button" onClick={() => setArt({ kind: 'none' })}>
            Remove art
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*,video/*"
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) choose(file);
          event.currentTarget.value = '';
        }}
      />
    </div>
  );
}

function ArtPreview({ project, art }: { project: SceneProject; art: Art }) {
  const shown = shownArt(project, art);
  const kind = backgroundKind(shown?.name ?? null);
  let note = 'Drop an image or a video anywhere to try it.';
  if (art.kind === 'file') note = 'Shown for the whole set. Your project is unchanged.';
  return (
    <>
      <div className="sc-art-preview" data-kind={kind}>
        {kind === 'video' && <video src={shown!.src} muted autoPlay loop playsInline />}
        {kind === 'image' && <img src={shown!.src} alt="" />}
        {kind === 'none' && <span>No art</span>}
      </div>
      <p className="sc-art-name">{shown?.name ?? 'The theme shows the set without art.'}</p>
      <p className="sc-art-note">{note}</p>
    </>
  );
}

function shownArt(project: SceneProject, art: Art) {
  if (art.kind === 'file') return { src: art.url, name: art.name };
  if (art.kind === 'none' || !project.background) return null;
  return { src: assetUrl(project.background), name: project.background };
}

export function DropOverlay() {
  return (
    <div className="sc-drop" role="status">
      <div className="sc-drop-frame">
        <strong>Drop to use as art</strong>
        <span>The image or video is shown for the whole set</span>
      </div>
    </div>
  );
}
