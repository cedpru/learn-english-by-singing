/// Local server address. The desktop app starts this server itself; the port
/// can be overridden at build time with `--dart-define=API_BASE=…`.
const String kApiBase = String.fromEnvironment(
  'API_BASE',
  defaultValue: 'http://127.0.0.1:8787',
);
