import { createServer } from 'node:net';
import { SetcastError } from '@setcast/core';

/** Check before Remotion starts a compositor, which it can leave running if port binding fails. */
export function checkLocalServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', (cause) => {
      reject(
        new SetcastError(
          "Cannot start the renderer's local HTTP server",
          'Allow the renderer to bind a localhost port in your sandbox or firewall settings, then retry.',
          { cause, exitCode: 1 },
        ),
      );
    });
    server.listen(0, '127.0.0.1', () => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });
}
