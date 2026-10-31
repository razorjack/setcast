import { SetcastError } from '@setcast/core';

/** Translate only an absent adapter; failures inside an installed adapter retain their cause. */
export async function loadRemotion<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'ERR_MODULE_NOT_FOUND' &&
      error.message.includes("Cannot find package '@setcast/renderer-remotion'")
    )
      throw new SetcastError(
        'The selected Remotion renderer is not installed.',
        'Use --renderer browser, or install @setcast/renderer-remotion alongside @setcast/cli in the same local or global installation.',
        { cause: error },
      );
    throw error;
  }
}
