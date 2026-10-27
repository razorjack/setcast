export const assetUrl = (path: string): string =>
  `/assets/${path.split('/').map(encodeURIComponent).join('/')}`;
