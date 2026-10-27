import { scaleLevel } from '../../audio/audio.ts';
import { ConstellationConfigSchema, type ConstellationConfig } from '../../visualizers.ts';
import { constellationFragment } from './constellation-shader.ts';
import { constellationMotion } from './gpu-motion.ts';
import { ShaderCanvas, type Shader } from './ShaderCanvas.tsx';

export { ConstellationConfigSchema, type ConstellationConfig };

const constellation: Shader<ConstellationConfig> = {
  name: 'constellation',
  fragment: constellationFragment,
  uniforms: ['phase', 'audio', 'depths', 'layers', 'drift', 'density', 'links', 'seed'],
  apply(gl, uniforms, frame, config) {
    const motion = constellationMotion(frame.timeSeconds, config);
    gl.uniform4fv(uniforms.phase!, motion.phases);
    gl.uniform3f(
      uniforms.audio!,
      scaleLevel(frame.audio.bass, config.gain, 0),
      scaleLevel(frame.audio.mids, config.gain, 0),
      scaleLevel(frame.audio.highs, config.gain, 0),
    );
    gl.uniform3fv(uniforms.depths!, motion.depths);
    gl.uniform3uiv(uniforms.layers!, motion.layers);
    gl.uniform2fv(uniforms.drift!, motion.drift);
    gl.uniform1f(uniforms.density!, config.density);
    gl.uniform1f(uniforms.links!, config.links);
    gl.uniform1ui(uniforms.seed!, config.seed);
  },
};

export function Constellation({ config }: { config: ConstellationConfig }) {
  return <ShaderCanvas shader={constellation} config={config} />;
}
