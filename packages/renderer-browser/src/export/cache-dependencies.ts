import type { ResolvedProject } from '@setcast/core';

// Only Branding reads announcement text in the built-in export entry. A plugin/custom entry
// can read arbitrary project fields and must not inherit this dependency contract by default.
const auditedVisualizers = new Set([
  'spectrum',
  'radial',
  'meters',
  'oscilloscope',
  'vectorscope',
  'spectrogram',
  'ridgeline',
  'overview',
  'bloom',
  'field',
  'tunnel',
  'constellation',
]);

type AnnouncementProject = Pick<
  ResolvedProject,
  'fps' | 'announcements' | 'visualizers' | 'scenes'
>;

/** Only text changes can be local; metadata, ordering and all other project inputs stay global. */
export function announcementDependencies(project: AnnouncementProject) {
  if (
    project.announcements.length === 0 ||
    [project, ...(project.scenes ?? []).map(({ scene }) => scene)].some((scene) =>
      scene.visualizers.some(({ name }) => !auditedVisualizers.has(name)),
    )
  )
    return null;
  const announcements = project.announcements.map((entry) => ({ ...entry }));
  const { fps } = project;
  return {
    metadata: announcements.map(({ text: _text, ...metadata }) => metadata),
    texts(range: [number, number]): [number, string][] {
      const first = range[0] / fps;
      const last = range[1] / fps;
      return announcements.flatMap((entry, index) => {
        // Match messageAt's subtraction; adding at + seconds can round differently at expiry.
        const overlaps = entry.at <= last && first - entry.at < entry.seconds;
        return overlaps ? [[index, entry.text] as [number, string]] : [];
      });
    },
  };
}
