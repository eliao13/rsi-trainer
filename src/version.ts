declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;
declare const __APP_BUILT__: string;

// Filled in at build time by vite.config.ts (fallbacks for tests, which don't run the build).
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
export const APP_COMMIT = typeof __APP_COMMIT__ === 'string' ? __APP_COMMIT__ : 'dev';
export const APP_BUILT = typeof __APP_BUILT__ === 'string' ? __APP_BUILT__ : '';
/** "v2.3.0 · a0ad476": what a tester should quote. */
export const VERSION_LABEL = 'v' + APP_VERSION + ' · ' + APP_COMMIT;
export const COMMIT_URL = APP_COMMIT === 'dev' ? '' : 'https://github.com/eliao13/rsi-trainer/commit/' + APP_COMMIT;
