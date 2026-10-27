import { scaleLevel } from '../../audio/audio.ts';
import { FieldConfigSchema, type FieldConfig } from '../../visualizers.ts';
import { fieldPhases } from './gpu-motion.ts';
import { fieldFragment } from './field-shader.ts';
import { ShaderCanvas, type Shader } from './ShaderCanvas.tsx';

export { FieldConfigSchema, type FieldConfig };

const field: Shader<FieldConfig> = {
  name: 'field',
  fragment: fieldFragment,
  uniforms: ['phase', 'audio', 'scale'],
  apply(gl, uniforms, frame, config) {
    gl.uniform4fv(uniforms.phase!, fieldPhases(frame.timeSeconds, config.speed, config.seed));
    gl.uniform3f(
      uniforms.audio!,
      scaleLevel(frame.audio.bass, config.gain, 0),
      scaleLevel(frame.audio.mids, config.gain, 0),
      scaleLevel(frame.audio.highs, config.gain, 0),
    );
    gl.uniform1f(uniforms.scale!, config.scale);
  },
};

export function Field({ config }: { config: FieldConfig }) {
  return <ShaderCanvas shader={field} config={config} />;
}
