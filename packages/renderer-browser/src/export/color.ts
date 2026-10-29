/** Playwright captures sRGB as full-range BT.601 JPEG; the matrix does not define RGB primaries. */
export const SCREENSHOT_COLOR_FILTER =
  'setparams=range=full:color_primaries=bt709:color_trc=iec61966-2-1:colorspace=bt470bg';
