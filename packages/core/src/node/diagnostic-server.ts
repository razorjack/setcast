import { createServer } from 'node:http';
import type { RendererDiagnostics } from './renderer-diagnostics.ts';

export async function diagnoseLocalServer(session: RendererDiagnostics) {
  await session.check(
    'local-server',
    session.capabilities.features,
    'Allow Setcast to bind and access a loopback HTTP port in your sandbox or firewall.',
    async () => {
      const server = createServer((_request, response) => response.end('setcast-doctor'));
      const signal = AbortSignal.any([
        AbortSignal.timeout(session.options.timeoutMs),
        ...(session.options.signal ? [session.options.signal] : []),
      ]);
      try {
        await new Promise<void>((resolve, reject) => {
          const abort = () => reject(signal.reason);
          signal.addEventListener('abort', abort, { once: true });
          server.once('error', reject);
          server.listen({ host: '127.0.0.1', port: 0, signal }, () => {
            signal.removeEventListener('abort', abort);
            resolve();
          });
        });
        const address = server.address();
        if (!address || typeof address === 'string')
          throw new Error('Loopback server has no port.');
        const response = await fetch(`http://127.0.0.1:${address.port}`, { signal });
        if ((await response.text()) !== 'setcast-doctor')
          throw new Error('Unexpected loopback response.');
        return { message: 'Bound and fetched a temporary loopback HTTP endpoint.' };
      } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    },
  );
}
