import { scaleLevel } from '../../audio/audio.ts';
import { TunnelConfigSchema, type TunnelConfig } from '../../visualizers.ts';
import { tunnelMotion } from './gpu-motion.ts';
import { ShaderCanvas, type Shader } from './ShaderCanvas.tsx';
import { tunnelFragment } from './tunnel-shader.ts';

export { TunnelConfigSchema, type TunnelConfig };

const tunnel: Shader<TunnelConfig> = {
  name: 'tunnel',
  fragment: tunnelFragment,
  uniforms: ['motion', 'audio', 'shape', 'seed'],
  apply(gl, uniforms, frame, config) {
    gl.uniform2fv(uniforms.motion!, tunnelMotion(frame.timeSeconds, config));
    gl.uniform3f(
      uniforms.audio!,
      scaleLevel(frame.audio.bass, config.gain, 0),
      scaleLevel(frame.audio.mids, config.gain, 0),
      scaleLevel(frame.audio.highs, config.gain, 0),
    );
    gl.uniform4f(uniforms.shape!, config.sides, config.rings, config.spokes, config.twist);
    gl.uniform1ui(uniforms.seed!, config.seed);
  },
};

export function Tunnel({ config }: { config: TunnelConfig }) {
  return <ShaderCanvas shader={tunnel} config={config} />;
}
