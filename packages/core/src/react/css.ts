declare module 'react' {
  interface CSSProperties {
    [custom: `--${string}`]: string | number | undefined;
  }
}

export {};
