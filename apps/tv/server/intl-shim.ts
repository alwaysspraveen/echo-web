// Node.js for Mobile is built without ICU, so `Intl` doesn't exist. youtubei.js only needs the
// time zone from it; the Android app passes the TV's time zone as the 4th argument.
const g = globalThis as unknown as { Intl?: unknown };
if (typeof g.Intl === 'undefined') {
  const timeZone = process.argv[4] || 'UTC';
  g.Intl = { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone, locale: 'en-US' }) }) };
}
export {};
