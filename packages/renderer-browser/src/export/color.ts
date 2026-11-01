/** Playwright captures sRGB as full-range BT.601 JPEG; the matrix does not define RGB primaries. */
export const SCREENSHOT_COLOR_FILTER =
  'setparams=range=full:color_primaries=bt709:color_trc=iec61966-2-1:colorspace=bt470bg';

/** PNG stores straight sRGB. ProRes uses limited-range BT.709 YUV with an unassociated alpha plane. */
export const PRORES_COLOR_FILTER =
  'scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuva444p10le,setparams=range=limited:color_primaries=bt709:color_trc=iec61966-2-1:colorspace=bt709';
