import { useRef } from 'react';

/** Keep one keyboard-accessible action while the native dialog owns file selection. */
export function ProfileImport({
  label,
  upload,
}: {
  label: string;
  upload: (file: File) => Promise<unknown>;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button className="sc-button" onClick={() => input.current?.click()}>
        {label}
      </button>
      <input
        ref={input}
        hidden
        aria-label={label}
        type="file"
        accept=".json,application/json"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void upload(file);
        }}
      />
    </>
  );
}
