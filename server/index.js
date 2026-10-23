// Entry point used by the Flutter desktop launcher (desktop/lib/server_launcher.dart).
// The Nest server is compiled to CommonJS: run `npm run build:server` first.
const { existsSync } = require('node:fs');
const path = require('node:path');

const entry = path.join(__dirname, 'dist', 'main.js');
if (!existsSync(entry)) {
  console.error('Serveur non compilé : lance `npm run build:server` à la racine du projet.');
  process.exit(1);
}

require(entry);
