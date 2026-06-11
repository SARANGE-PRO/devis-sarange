import assert from 'node:assert/strict';

import { jsPDF } from 'jspdf';

import {
  collectQuoteImageSources,
  getPdfCurrentPageNumber,
  renderOnPdfPage,
} from '../lib/pdf-page-utils.js';

assert.deepEqual(
  collectQuoteImageSources([
    { customImage: 'data:image/png;base64,AAA' },
    { customImage: 'data:image/png;base64,AAA' },
    { customImage: ' /products/example.webp ' },
    { customImage: '' },
    {},
  ]),
  ['data:image/png;base64,AAA', '/products/example.webp']
);

const baselineDoc = new jsPDF({ unit: 'mm' });
baselineDoc.addPage();
baselineDoc.setPage(1);

let baselinePage = null;
const baselineRender = Promise.resolve().then(() => {
  baselinePage = getPdfCurrentPageNumber(baselineDoc);
});

baselineDoc.setPage(2);
await baselineRender;

assert.equal(
  baselinePage,
  2,
  'Un rendu asynchrone non lie utilise la page active courante.'
);

const boundDoc = new jsPDF({ unit: 'mm' });
boundDoc.addPage();
boundDoc.setPage(1);

let renderedPage = null;
const boundRender = Promise.resolve().then(() =>
  renderOnPdfPage(boundDoc, 1, (doc) => {
    renderedPage = getPdfCurrentPageNumber(doc);
    doc.text('image-placeholder', 10, 10);
  })
);

boundDoc.setPage(2);
await boundRender;

assert.equal(renderedPage, 1);
assert.equal(getPdfCurrentPageNumber(boundDoc), 2);

console.log('pdf page utils ok');
