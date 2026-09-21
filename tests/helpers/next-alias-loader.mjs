// Chargeur Node (module hooks) pour tester le code de l'application tel quel :
//  - alias « @/lib/x » -> <racine>/lib/x ;
//  - imports relatifs sans extension ('./products' -> './products.js') ;
//  - fichiers JSON importés comme modules (export default) ;
//  - fichiers .js du projet lus comme ESM (ils utilisent import/export) ;
//  - bibliothèques PDF (jspdf, jspdf-autotable, pdf-lib) remplacées par des
//    doublures : les tests ne produisent pas de PDF, seulement les schémas.
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HELPERS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HELPERS_DIR, '..', '..');
const ROOT_URL = pathToFileURL(ROOT + path.sep).href;
const EXTENSIONS = ['.js', '.mjs', '.jsx', '.json'];

const STUBS = {
  jspdf: path.join(HELPERS_DIR, 'stubs', 'jspdf.mjs'),
  'jspdf-autotable': path.join(HELPERS_DIR, 'stubs', 'jspdf-autotable.mjs'),
  'pdf-lib': path.join(HELPERS_DIR, 'stubs', 'pdf-lib.mjs'),
};

const isFile = (candidate) => existsSync(candidate) && statSync(candidate).isFile();

const withExtension = (absolutePath) => {
  if (isFile(absolutePath)) return absolutePath;
  for (const extension of EXTENSIONS) {
    if (isFile(absolutePath + extension)) return absolutePath + extension;
  }
  for (const extension of EXTENSIONS) {
    const index = path.join(absolutePath, `index${extension}`);
    if (isFile(index)) return index;
  }
  return null;
};

const isProjectUrl = (url) => url.startsWith(ROOT_URL) && !url.includes('/node_modules/');

export async function resolve(specifier, context, nextResolve) {
  if (STUBS[specifier]) {
    return { url: pathToFileURL(STUBS[specifier]).href, shortCircuit: true };
  }

  let target = null;
  if (specifier.startsWith('@/')) {
    target = path.join(ROOT, specifier.slice(2));
  } else if (
    (specifier.startsWith('./') || specifier.startsWith('../')) &&
    context.parentURL &&
    isProjectUrl(context.parentURL)
  ) {
    target = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
  }

  if (target) {
    const found = withExtension(target);
    if (found) return { url: pathToFileURL(found).href, shortCircuit: true };
  }

  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (isProjectUrl(url)) {
    if (url.endsWith('.json')) {
      const source = readFileSync(fileURLToPath(url), 'utf8');
      return { format: 'module', source: `export default ${source};`, shortCircuit: true };
    }
    if (url.endsWith('.js') || url.endsWith('.mjs')) {
      const source = readFileSync(fileURLToPath(url), 'utf8');
      return { format: 'module', source, shortCircuit: true };
    }
  }

  return nextLoad(url, context);
}
