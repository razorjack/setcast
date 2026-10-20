import type { ReactNode } from 'react';

function Icon({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      className="sc-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const PlayIcon = () => (
  <Icon size={22}>
    <path
      d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z"
      fill="currentColor"
    />
  </Icon>
);

export const PauseIcon = () => (
  <Icon size={22}>
    <rect x="6.5" y="5" width="3.6" height="14" rx="1" fill="currentColor" stroke="none" />
    <rect x="13.9" y="5" width="3.6" height="14" rx="1" fill="currentColor" stroke="none" />
  </Icon>
);

export const VolumeIcon = ({ level }: { level: number }) => (
  <Icon>
    <path d="M4 9.5h3l4.5-4v13L7 14.5H4z" />
    {level > 0 && <path d="M15.5 9.2a4 4 0 0 1 0 5.6" />}
    {level > 0.5 && <path d="M18.3 6.6a7.7 7.7 0 0 1 0 10.8" />}
    {level === 0 && <path d="m16 9.5 5 5m0-5-5 5" />}
  </Icon>
);

export const ThemeIcon = () => (
  <Icon>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="3.5" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="3.5" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
  </Icon>
);

export const ArtIcon = () => (
  <Icon>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <circle cx="9" cy="9.5" r="1.6" />
    <path d="m4 17 5-4.5 3.5 3 3-2.5 4.5 4" />
  </Icon>
);

export const DockIcon = ({ pinned }: { pinned: boolean }) => (
  <Icon>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    {pinned ? <path d="M3.5 15h17" /> : <path d="M9 15.5h6" strokeDasharray="1.5 2.5" />}
  </Icon>
);

export const FullscreenIcon = ({ active }: { active: boolean }) => (
  <Icon>
    {active ? (
      <path d="M9 4v3a2 2 0 0 1-2 2H4m16 0h-3a2 2 0 0 1-2-2V4m0 16v-3a2 2 0 0 1 2-2h3M4 15h3a2 2 0 0 1 2 2v3" />
    ) : (
      <path d="M4 9V6a2 2 0 0 1 2-2h3m6 0h3a2 2 0 0 1 2 2v3m0 6v3a2 2 0 0 1-2 2h-3m-6 0H6a2 2 0 0 1-2-2v-3" />
    )}
  </Icon>
);

export const KeyboardIcon = () => (
  <Icon>
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M8 14h8" />
  </Icon>
);

export const CheckIcon = () => (
  <Icon size={16}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
);

export const UploadIcon = () => (
  <Icon size={16}>
    <path d="M12 15V4m-4.5 4.5L12 4l4.5 4.5M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />
  </Icon>
);
