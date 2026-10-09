// Prüft die Abhängigkeitsregeln aus ADR 0001 (docs/adr/0001-frontend-architektur.md):
//   1. shared/ importiert nichts aus features/
//   2. Ein Feature wird von außen nur über seine index.ts importiert
// Aufruf: npm run check:boundaries
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');
const IMPORT_RE = /(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"?]+)/g;

const files = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });

// features/<name>/... → <name>, sonst null
const featureOf = (rel) => (rel.startsWith('features/') ? rel.split('/')[1] : null);

const violations = [];
for (const file of files(SRC)) {
  const rel = path.relative(SRC, file).split(path.sep).join('/');
  const source = fs.readFileSync(file, 'utf8');
  for (const [, spec] of source.matchAll(IMPORT_RE)) {
    const target = path.relative(SRC, path.resolve(path.dirname(file), spec)).split(path.sep).join('/');
    const targetFeature = featureOf(target);
    if (!targetFeature) continue;

    if (rel.startsWith('shared/')) {
      violations.push(`${rel}: shared/ darf nicht aus features/ importieren ('${spec}')`);
    } else if (featureOf(rel) !== targetFeature && target !== `features/${targetFeature}` && target !== `features/${targetFeature}/index`) {
      violations.push(`${rel}: Feature '${targetFeature}' nur über seine index.ts importieren ('${spec}')`);
    }
  }
}

if (violations.length) {
  console.error(`✗ ${violations.length} Verstoß/Verstöße gegen die Modulgrenzen:\n  ` + violations.join('\n  '));
  process.exit(1);
}
console.log('✓ Modulgrenzen eingehalten');
