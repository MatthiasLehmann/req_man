// Erzeugt die API-Typen aus dem OpenAPI-Schema des Backends (ADR 0001, Schritt 1).
//   npm run generate:api   → schreibt openapi.json und src/shared/api/schema.d.ts
//   npm run check:api      → schlägt fehl, wenn die Dateien nicht zum Backend passen
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BACKEND = path.resolve(FRONTEND, '../backend');
const SCHEMA_JSON = path.join(FRONTEND, 'openapi.json');
const SCHEMA_TS = path.join(FRONTEND, 'src/shared/api/schema.d.ts');
const check = process.argv.includes('--check');

const HEADER = `/**
 * AUTOMATISCH GENERIERT – nicht von Hand ändern.
 * Quelle: OpenAPI-Schema des Backends, erzeugt mit \`npm run generate:api\`.
 */

`;

// Python aus dem Backend-venv (macOS/Linux: bin/, Windows: Scripts/), sonst aus dem PATH
const python = [
  path.join(BACKEND, '.venv/bin/python'),
  path.join(BACKEND, '.venv/Scripts/python.exe'),
].find((p) => fs.existsSync(p)) ?? 'python3';

const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'reqman-openapi-')), 'openapi.json');
execFileSync(python, ['export_openapi.py', tmp], { cwd: BACKEND, stdio: ['ignore', 'ignore', 'inherit'] });
const schemaJson = fs.readFileSync(tmp, 'utf8');
// defaultNonNullable: false – Request-Felder mit Default (z. B. `active: bool = True`) bleiben
// optional. Dass sie in Antworten immer enthalten sind, beschreibt bereits export_openapi.py.
const schemaTs = HEADER + astToString(await openapiTS(JSON.parse(schemaJson), { defaultNonNullable: false }));

if (check) {
  const stale = [
    [SCHEMA_JSON, schemaJson],
    [SCHEMA_TS, schemaTs],
  ].filter(([file, content]) => !fs.existsSync(file) || fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') !== content);
  if (stale.length) {
    console.error('✗ API-Typen passen nicht zum Backend – bitte `npm run generate:api` ausführen:');
    stale.forEach(([file]) => console.error('  ' + path.relative(FRONTEND, file)));
    process.exit(1);
  }
  console.log('✓ API-Typen aktuell');
} else {
  fs.writeFileSync(SCHEMA_JSON, schemaJson);
  fs.writeFileSync(SCHEMA_TS, schemaTs);
  console.log(`✓ ${path.relative(FRONTEND, SCHEMA_JSON)} und ${path.relative(FRONTEND, SCHEMA_TS)} erzeugt`);
}
