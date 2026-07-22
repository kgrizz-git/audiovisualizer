declare module 'node:fs/promises' {
  export function readFile(path: string): Promise<Uint8Array>;
  export function writeFile(path: string, data: string | Uint8Array): Promise<void>;
}

declare const process: {
  argv: string[];
  exitCode?: number;
};
