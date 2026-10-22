import type { CSSProperties } from 'react';
import {
  messageAt,
  messageLayout,
  showsIdentity,
  type Branding as BrandingConfig,
  type BrandMessage,
} from '../../branding.ts';
import { useFrame } from '../frame.tsx';
import { Img } from '../renderer.tsx';

/** The logo and identity block, and the message line with rotating messages or announcements. */
export function Branding() {
  const { composition, timeSeconds } = useFrame();
  const { branding } = composition.project;
  const message = messageAt(branding, composition.announcements, timeSeconds);
  return (
    <>
      {showsIdentity(branding) && <Identity branding={branding} />}
      {message && <MessageLine message={message} branding={branding} />}
    </>
  );
}

function Identity({ branding }: { branding: BrandingConfig }) {
  const { logo, name, event, episode } = branding;
  const style = {
    '--brand-size': branding.size,
    '--brand-opacity': branding.opacity,
  } as CSSProperties;
  return (
    <div className="sc-brand-identity" data-position={branding.position} style={style}>
      {logo && <Img src={logo} className="sc-brand-logo" />}
      {(name || event || episode) && (
        <div className="sc-brand-text">
          {name && <span className="sc-brand-name">{name}</span>}
          {event && <span className="sc-brand-event">{event}</span>}
          {episode && <span className="sc-brand-episode">{episode}</span>}
        </div>
      )}
    </div>
  );
}

function MessageLine({
  message,
  branding,
}: {
  message: BrandMessage;
  branding: BrandingConfig | null;
}) {
  const { position, size } = messageLayout(branding);
  const style = {
    '--message-presence': Math.round(message.presence * 1000) / 1000,
    '--message-index': message.index,
    '--message-size': size,
  } as CSSProperties;
  return (
    <div
      className="sc-brand-message"
      data-position={position}
      data-kind={message.kind}
      style={style}
    >
      <span className="sc-brand-message-text">{message.text}</span>
    </div>
  );
}
