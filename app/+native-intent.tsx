// Validate external links before Expo Router's legacy query decoder sees them.
// Keep valid links unchanged, including provider return and OAuth parameters.
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  if (typeof path !== 'string' || path.length > 8192 || /[\u0000-\u001f\u007f]/.test(path)) return '/';
  try {
    decodeURIComponent(path);
    return path;
  } catch {
    return '/';
  }
}
