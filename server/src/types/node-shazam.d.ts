// node-shazam ships its declaration at dist/cjs/api.d.ts but its package.json
// "typings" points to dist/api.d.ts, which does not exist: TypeScript cannot
// resolve it, so the (small) surface we use is declared here.
declare module 'node-shazam' {
  export class Shazam {
    constructor(timeZone?: string);
    recognise(path: string, language?: string, minimal?: boolean): Promise<unknown>;
  }
}
