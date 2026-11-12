/**
 * Chemise de dossier client papier (A3 paysage, pliée en deux) : la moitié
 * droite est la couverture — « DOSSIER CLIENT », nom, grande lettre de
 * classement, adresse, téléphone, e-mail, notes. La moitié gauche (dos) reste
 * blanche.
 *
 * Cotes relevées sur le modèle SARANGE_chemise_dossier_client_A3.pdf (en mm
 * depuis le coin haut gauche de la feuille 420 × 297).
 *
 * Module pur (aucun import) : testable en Node.
 */

const text = (value) => (typeof value === 'string' ? value.trim() : '');

const isProfessional = (clientData) =>
  text(clientData?.clientType).toUpperCase() === 'PROFESSIONNEL';

/**
 * Lettre de classement : société → 1re lettre de la raison sociale (champ
 * `nom`) ; particulier → 1re lettre du nom, ou du prénom à défaut. Accents
 * retirés (« Émile » → E) ; un nom commençant par un chiffre garde ce chiffre.
 */
export const getClientFolderLetter = (clientData = {}) => {
  const source = text(clientData?.nom) || text(clientData?.prenom);
  const plain = source.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const match = /[A-Za-z0-9]/.exec(plain);
  return match ? match[0].toUpperCase() : '';
};

/** Nom porté sur la chemise : raison sociale, ou « DUPONT Jean ». */
export const getClientFolderName = (clientData = {}) => {
  const nom = text(clientData?.nom);
  const prenom = text(clientData?.prenom);
  if (isProfessional(clientData)) return nom || prenom;
  return [nom.toUpperCase(), prenom].filter(Boolean).join(' ');
};

/** Champs pré-remplis depuis la fiche client (tous modifiables ensuite). */
export const buildClientFolderFields = (clientData = {}) => ({
  letter: getClientFolderLetter(clientData),
  name: getClientFolderName(clientData),
  addressLine1: text(clientData?.adresse),
  addressLine2: [text(clientData?.codePostal), text(clientData?.ville)].filter(Boolean).join(' '),
  phone: text(clientData?.telephone),
  email: text(clientData?.email),
  notes: '',
});

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// Le nom tient sur la ligne de 122 mm : la taille baisse pour les noms longs.
const getNameFontSizePt = (name) => {
  const length = text(name).length;
  if (length <= 22) return 22;
  if (length <= 30) return 18;
  if (length <= 40) return 14;
  return 11;
};

/**
 * Document HTML autonome de la chemise.
 *  • mode 'print' : feuille A3 paysage entière (@page A3 landscape, marges 0) ;
 *  • mode 'preview' : couverture seule (moitié droite), réduite à `previewWidthPx`.
 */
export const buildClientFolderHtml = (fields = {}, { mode = 'print', previewWidthPx = 360 } = {}) => {
  const f = { ...buildClientFolderFields({}), ...fields };
  const isPreview = mode === 'preview';
  // 210 mm = 793,7 px CSS : échelle de l'aperçu (couverture seule).
  const previewScale = previewWidthPx / ((210 * 96) / 25.4);

  // Valeur posée juste au-dessus de son filet (11 pt ≈ 3,9 mm de haut).
  const value = (content, ruleTopMm) =>
    content
      ? `<div class="value" style="top:${(ruleTopMm - 4.6).toFixed(1)}mm">${escapeHtml(content)}</div>`
      : '';

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Dossier client${f.name ? ` – ${escapeHtml(f.name)}` : ''}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
  @page { size: A3 landscape; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: #fff; }
  body {
    font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
    color: #0f172a;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    overflow: hidden;
  }
  .sheet { position: relative; width: 420mm; height: 297mm; overflow: hidden; background: #fff; }
  ${isPreview ? `
  .viewport { width: 210mm; height: 297mm; overflow: hidden; transform: scale(${previewScale.toFixed(4)}); transform-origin: top left; }
  .sheet { margin-left: -210mm; }` : ''}
  .abs { position: absolute; }
  .fold { position: absolute; left: 210mm; width: 0; height: 5.8mm; border-left: 0.3mm solid #94a3b8; }
  .label {
    position: absolute; left: 226mm;
    font-size: 7.5pt; font-weight: 700; letter-spacing: 0.14em; color: #64748b;
    text-transform: uppercase; line-height: 1;
  }
  .rule { position: absolute; left: 226mm; width: 181.7mm; height: 0; border-top: 0.25mm solid #cbd5e1; }
  .value {
    position: absolute; left: 258mm; right: 13mm;
    font-size: 11pt; font-weight: 500; color: #0f172a; line-height: 1;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .corner { position: absolute; width: 5.8mm; height: 5.8mm; border-color: #cbd5e1; border-style: solid; border-width: 0; }
  .notes-box {
    position: absolute; left: 226mm; top: 147mm; width: 181.7mm; height: 128.3mm;
    border: 0.25mm solid #cbd5e1; border-radius: 2.6mm;
    padding: 5mm; font-size: 10.5pt; line-height: 1.5; color: #0f172a;
    white-space: pre-wrap; overflow: hidden;
  }
</style>
</head>
<body>
<div class="viewport">
<div class="sheet">
  <!-- Repères de pliure -->
  <div class="fold" style="top:0"></div>
  <div class="fold" style="bottom:0"></div>

  <div class="label" style="top:20.3mm">Dossier client</div>

  <!-- Nom -->
  <div class="abs" style="left:226mm; top:30mm; width:122mm; height:14.5mm; display:flex; align-items:flex-end;">
    <div style="font-size:${getNameFontSizePt(f.name)}pt; font-weight:800; letter-spacing:-0.01em; line-height:1.05; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%;">${escapeHtml(f.name)}</div>
  </div>
  <div class="abs" style="left:226mm; top:44.9mm; width:122mm; border-top:0.35mm solid #334155;"></div>

  <!-- Lettre de classement dans le cadre à coins -->
  <div class="corner" style="left:359.6mm; top:14.5mm; border-left-width:0.3mm; border-top-width:0.3mm;"></div>
  <div class="corner" style="left:401.9mm; top:14.5mm; border-right-width:0.3mm; border-top-width:0.3mm;"></div>
  <div class="corner" style="left:359.6mm; top:56.9mm; border-left-width:0.3mm; border-bottom-width:0.3mm;"></div>
  <div class="corner" style="left:401.9mm; top:56.9mm; border-right-width:0.3mm; border-bottom-width:0.3mm;"></div>
  <div class="abs" style="left:359.6mm; top:14.5mm; width:48.1mm; height:48.2mm; display:flex; align-items:center; justify-content:center; font-size:96pt; font-weight:900; line-height:1; color:#0f172a;">${escapeHtml(f.letter)}</div>

  <!-- Accent orange -->
  <div class="abs" style="left:226mm; top:74.8mm; width:15.2mm; height:1mm; background:#f97316;"></div>

  <!-- Coordonnées -->
  <div class="label" style="top:87.4mm">Adresse</div>
  ${value(f.addressLine1, 93.4)}
  <div class="rule" style="top:93.4mm"></div>
  ${value(f.addressLine2, 105.7)}
  <div class="rule" style="top:105.7mm"></div>

  <div class="label" style="top:111.9mm">Téléphone</div>
  ${value(f.phone, 117.9)}
  <div class="rule" style="top:117.9mm"></div>

  <div class="label" style="top:124.2mm">E-mail</div>
  ${value(f.email, 130.2)}
  <div class="rule" style="top:130.2mm"></div>

  <!-- Notes -->
  <div class="label" style="top:141.4mm">Notes</div>
  <div class="notes-box">${escapeHtml(f.notes)}</div>

  <!-- Logo -->
  <div class="abs" style="right:12.3mm; top:280.5mm; font-size:14pt; font-weight:900; letter-spacing:-0.04em; line-height:1; color:#0f172a;">SARANGE<span style="color:#f97316">.</span></div>
</div>
</div>
</body>
</html>`;
};
