import assert from 'node:assert/strict';
import {
  CALCULATED_UNVERIFIED_ALERT,
  MANUAL_CONFIRMATION_WARNING,
  NOT_FOUND_DGFIP_ALERT,
  TVA_VERIFICATION_STATUSES,
  VAT_LOOKUP_OUTCOMES,
  buildManualVatConfirmation,
  buildVatPatchFromLookup,
  isTvaVerified,
  resolveClientVatState,
} from '../lib/vat-verification.mjs';
import { computeFrenchVatNumber, getClientTaxIdentity } from '../lib/client-type.mjs';
import {
  AUTOLIQUIDATION_IDENTITY_ERROR,
  AUTOLIQUIDATION_VAT_VERIFICATION_ERROR,
  TAX_REGIMES,
  getTaxRegimeValidation,
} from '../lib/tax-regime.mjs';

const run = (name, fn) => {
  try {
    fn();
    console.log(`OK - ${name}`);
  } catch (error) {
    console.error(`KO - ${name}`);
    throw error;
  }
};

const SIREN = '820001014';
const SIRET = '82000101400035';
const POSE_ITEMS = [{ productId: 'fenetre-1v', includePose: true }];

// Devis / facture en autoliquidation pour un client professionnel donné.
const validate = (clientData, { requireVerifiedVatNumber = false } = {}) =>
  getTaxRegimeValidation({
    clientType: 'PROFESSIONNEL',
    tvaRate: 0,
    cartItems: POSE_ITEMS,
    clientData: { clientType: 'PROFESSIONNEL', siret: SIRET, ...clientData },
    requireVerifiedVatNumber,
  });

run('un numéro calculé absent de l’extraction DGFiP n’est pas retenu', () => {
  // La DGFiP répond : aucun numéro français pour ce SIREN dans l'extraction.
  const patch = buildVatPatchFromLookup({
    outcome: VAT_LOOKUP_OUTCOMES.NOT_FOUND_DGFIP,
    siren: SIREN,
  });

  // Le numéro que la formule aurait produit ne doit PAS être conservé.
  assert.equal(computeFrenchVatNumber(SIREN), 'FR22820001014');
  assert.equal(patch.tvaIntra, '');
  // Statut spécifique : ce n'est PAS « aucun numéro de TVA » (MISSING).
  assert.equal(patch.tvaVerificationStatus, TVA_VERIFICATION_STATUSES.NOT_FOUND_DGFIP);
  assert.notEqual(patch.tvaVerificationStatus, TVA_VERIFICATION_STATUSES.MISSING);
  assert.equal(patch.tvaVerifiedNumber, '');
});

run('NOT_FOUND_DGFIP : identité incomplète, devis bloqué, nuance rappelée', () => {
  const patch = buildVatPatchFromLookup({
    outcome: VAT_LOOKUP_OUTCOMES.NOT_FOUND_DGFIP,
    siren: SIREN,
  });
  const clientData = { clientType: 'PROFESSIONNEL', siret: SIRET, siren: SIREN, ...patch };

  // La formule ne ressuscite pas un numéro déclaré absent de l'extraction.
  const state = resolveClientVatState(clientData);
  assert.equal(state.status, TVA_VERIFICATION_STATUSES.NOT_FOUND_DGFIP);
  assert.equal(state.vatNumber, '');
  assert.equal(state.isVerified, false);

  const validation = validate(patch);
  assert.equal(validation.taxRegime, TAX_REGIMES.AUTOLIQUIDATION_BTP);
  assert.equal(validation.isValid, false);
  assert.ok(validation.errors.includes(AUTOLIQUIDATION_IDENTITY_ERROR));
  // Le message rappelle qu'un numéro étranger ou récent reste possible.
  assert.ok(validation.warnings.includes(NOT_FOUND_DGFIP_ALERT));
  assert.equal(validate(patch, { requireVerifiedVatNumber: true }).isValid, false);
});

run('NOT_FOUND_DGFIP levé par une validation VIES ou une confirmation manuelle', () => {
  // VIES confirme le numéro : la facture redevient possible.
  const viaVies = buildVatPatchFromLookup({
    outcome: VAT_LOOKUP_OUTCOMES.VERIFIED,
    vatNumber: 'FR22820001014',
    source: 'vies',
    siren: SIREN,
    checkedAt: '2026-07-30T09:15:00.000Z',
  });
  assert.equal(viaVies.tvaVerificationStatus, TVA_VERIFICATION_STATUSES.VERIFIED_VIES);
  assert.equal(validate(viaVies, { requireVerifiedVatNumber: true }).isValid, true);

  // Ou confirmation manuelle documentée d'un numéro communiqué par le client.
  const viaManual = buildManualVatConfirmation({
    vatNumber: 'FR22820001014',
    confirmedBy: 'contact@sarange.fr',
    confirmedAt: '2026-07-30T09:15:00.000Z',
    source: 'ATTESTATION_FISCALE',
    comment: 'Attestation fiscale 2026 fournie par le client',
  });
  assert.equal(validate(viaManual, { requireVerifiedVatNumber: true }).isValid, true);
});

run('MISSING réservé à l’absence de numéro sans recherche concluante', () => {
  // Aucun numéro, aucun SIREN/SIRET : rien n'a pu être cherché.
  const state = resolveClientVatState({ clientType: 'PROFESSIONNEL' });
  assert.equal(state.status, TVA_VERIFICATION_STATUSES.MISSING);

  // Un SIREN connu sans recherche aboutie donne un numéro calculé, non vérifié
  // — et non un statut MISSING.
  const derived = resolveClientVatState({ siret: SIRET });
  assert.equal(derived.status, TVA_VERIFICATION_STATUSES.CALCULATED_UNVERIFIED);
  assert.equal(derived.isDerived, true);
});

run('API temporairement indisponible : préremplissage non vérifié + alerte', () => {
  const patch = buildVatPatchFromLookup({
    outcome: VAT_LOOKUP_OUTCOMES.UNAVAILABLE,
    siren: SIREN,
  });

  assert.equal(patch.tvaIntra, 'FR22820001014');
  assert.equal(patch.tvaVerificationStatus, TVA_VERIFICATION_STATUSES.CALCULATED_UNVERIFIED);
  assert.equal(isTvaVerified(patch.tvaVerificationStatus), false);

  // Devis : autorisé, mais l'alerte est remontée.
  const quote = validate(patch);
  assert.equal(quote.isValid, true);
  assert.deepEqual(quote.warnings, [CALCULATED_UNVERIFIED_ALERT]);
  assert.equal(quote.vatState.status, TVA_VERIFICATION_STATUSES.CALCULATED_UNVERIFIED);
});

run('facture en autoliquidation bloquée avec un statut CALCULATED_UNVERIFIED', () => {
  const patch = buildVatPatchFromLookup({
    outcome: VAT_LOOKUP_OUTCOMES.UNAVAILABLE,
    siren: SIREN,
  });

  const invoice = validate(patch, { requireVerifiedVatNumber: true });
  assert.equal(invoice.isValid, false);
  assert.ok(invoice.errors.includes(AUTOLIQUIDATION_VAT_VERIFICATION_ERROR));
  assert.deepEqual(invoice.warnings, []);

  // Un numéro seulement reconstitué depuis le SIREN (aucun numéro en fiche)
  // bloque également la facture.
  const derivedOnly = validate({}, { requireVerifiedVatNumber: true });
  assert.equal(derivedOnly.vatState.isDerived, true);
  assert.equal(derivedOnly.isValid, false);
});

run('confirmation manuelle refusée sans source ni référence', () => {
  const base = {
    vatNumber: 'FR22820001014',
    confirmedBy: 'contact@sarange.fr',
    confirmedAt: '2026-07-30T09:15:00.000Z',
  };

  // Ni source ni commentaire.
  assert.equal(buildManualVatConfirmation(base), null);
  // Source seule.
  assert.equal(buildManualVatConfirmation({ ...base, source: 'DOCUMENT_CLIENT' }), null);
  // Commentaire seul.
  assert.equal(buildManualVatConfirmation({ ...base, comment: 'facture 2026-0142' }), null);
  // Commentaire vide (espaces).
  assert.equal(
    buildManualVatConfirmation({ ...base, source: 'DOCUMENT_CLIENT', comment: '   ' }),
    null
  );
  // Source hors liste.
  assert.equal(
    buildManualVatConfirmation({ ...base, source: 'BOUCHE_A_OREILLE', comment: 'ref' }),
    null
  );
});

run('confirmation manuelle documentée : source, référence et justificatif', () => {
  const patch = buildManualVatConfirmation({
    vatNumber: 'FR 22 820 001 014',
    confirmedBy: 'contact@sarange.fr',
    confirmedAt: '2026-07-30T09:15:00.000Z',
    source: 'FACTURE_ANTERIEURE',
    comment: 'Facture 2026-0142 du 12/03/2026',
    attachment: 'https://drive.sarange.fr/justificatifs/2026-0142.pdf',
  });

  assert.equal(patch.tvaVerificationSource, 'FACTURE_ANTERIEURE');
  assert.equal(patch.tvaVerificationComment, 'Facture 2026-0142 du 12/03/2026');
  assert.equal(
    patch.tvaVerificationAttachment,
    'https://drive.sarange.fr/justificatifs/2026-0142.pdf'
  );

  const state = resolveClientVatState({ siret: SIRET, ...patch });
  assert.equal(state.source, 'FACTURE_ANTERIEURE');
  assert.equal(state.comment, 'Facture 2026-0142 du 12/03/2026');
  assert.ok(MANUAL_CONFIRMATION_WARNING.includes('source fiable'));
  assert.ok(MANUAL_CONFIRMATION_WARNING.includes('autoliquidation'));
});

run('modification du numéro après confirmation : vérification annulée', () => {
  const patch = buildManualVatConfirmation({
    vatNumber: 'FR22820001014',
    confirmedBy: 'contact@sarange.fr',
    confirmedAt: '2026-07-30T09:15:00.000Z',
    source: 'DOCUMENT_CLIENT',
    comment: 'Attestation transmise par le client',
  });

  // Le numéro est remplacé après coup : la confirmation ne s'applique plus.
  const tampered = resolveClientVatState({
    siret: SIRET,
    ...patch,
    tvaIntra: 'FR40552100554',
  });

  assert.equal(tampered.status, TVA_VERIFICATION_STATUSES.CALCULATED_UNVERIFIED);
  assert.equal(tampered.isVerified, false);
  assert.equal(tampered.verifiedBy, '');
  assert.equal(tampered.source, '');
  assert.equal(tampered.comment, '');
  // Et la facture en autoliquidation redevient impossible.
  assert.equal(
    validate({ ...patch, tvaIntra: 'FR40552100554' }, { requireVerifiedVatNumber: true }).isValid,
    false
  );
});

run('numéro confirmé manuellement : utilisateur et date enregistrés', () => {
  const patch = buildManualVatConfirmation({
    vatNumber: 'FR 22 820 001 014',
    confirmedBy: 'contact@sarange.fr',
    confirmedAt: '2026-07-30T09:15:00.000Z',
    source: 'DOCUMENT_CLIENT',
    comment: 'Attestation fiscale transmise le 30/07/2026',
  });

  assert.equal(patch.tvaIntra, 'FR22820001014');
  assert.equal(patch.tvaVerificationStatus, TVA_VERIFICATION_STATUSES.MANUALLY_CONFIRMED);
  assert.equal(patch.tvaVerifiedNumber, 'FR22820001014');
  assert.equal(patch.tvaVerifiedBy, 'contact@sarange.fr');
  assert.equal(patch.tvaVerifiedAt, '2026-07-30T09:15:00.000Z');

  // Devis sans alerte, facture autorisée.
  const quote = validate(patch);
  assert.equal(quote.isValid, true);
  assert.deepEqual(quote.warnings, []);
  const invoice = validate(patch, { requireVerifiedVatNumber: true });
  assert.equal(invoice.isValid, true);
  assert.equal(invoice.vatState.verifiedBy, 'contact@sarange.fr');
});

run('numéro étranger communiqué par une entreprise française : conservé tel quel', () => {
  const foreignNumber = 'BE0123456789';
  const patch = buildManualVatConfirmation({
    vatNumber: foreignNumber,
    confirmedBy: 'contact@sarange.fr',
    confirmedAt: '2026-07-30T09:15:00.000Z',
    source: 'DOCUMENT_CLIENT',
    comment: 'Numéro belge communiqué par le client',
  });
  const clientData = {
    clientType: 'PROFESSIONNEL',
    siret: SIRET,
    siren: SIREN,
    ...patch,
  };

  // Le numéro déclaré n'est JAMAIS remplacé par celui que la formule calcule.
  const identity = getClientTaxIdentity(clientData);
  assert.equal(identity.vatNumber, foreignNumber);
  assert.notEqual(identity.vatNumber, computeFrenchVatNumber(SIREN));
  assert.equal(identity.isVatNumberDerived, false);

  const state = resolveClientVatState(clientData);
  assert.equal(state.vatNumber, foreignNumber);
  assert.equal(state.status, TVA_VERIFICATION_STATUSES.MANUALLY_CONFIRMED);
  assert.equal(validate(patch, { requireVerifiedVatNumber: true }).isValid, true);
});

run('aucun passage automatique en « vérifié »', () => {
  // Un statut vérifié revendiqué sans numéro vérifié de référence ne tient pas.
  const forged = resolveClientVatState({
    siret: SIRET,
    tvaIntra: 'FR22820001014',
    tvaVerificationStatus: TVA_VERIFICATION_STATUSES.VERIFIED_DGFIP,
  });
  assert.equal(forged.status, TVA_VERIFICATION_STATUSES.CALCULATED_UNVERIFIED);

  // Numéro modifié APRÈS vérification : le statut retombe.
  const swapped = resolveClientVatState({
    siret: SIRET,
    tvaIntra: 'FR99999999999',
    tvaVerificationStatus: TVA_VERIFICATION_STATUSES.VERIFIED_VIES,
    tvaVerifiedNumber: 'FR22820001014',
    tvaVerifiedAt: '2026-07-30T09:15:00.000Z',
  });
  assert.equal(swapped.status, TVA_VERIFICATION_STATUSES.CALCULATED_UNVERIFIED);
  assert.equal(swapped.verifiedAt, '');

  // Statut inconnu (données antérieures) : jamais considéré comme vérifié.
  const legacy = resolveClientVatState({ siret: SIRET, tvaIntra: 'FR22820001014' });
  assert.equal(legacy.isVerified, false);
});

run('sources officielles : DGFiP et VIES valent vérification', () => {
  const dgfip = buildVatPatchFromLookup({
    outcome: VAT_LOOKUP_OUTCOMES.VERIFIED,
    vatNumber: 'FR22820001014',
    source: 'dgfip',
    siren: SIREN,
    checkedAt: '2026-07-30T09:15:00.000Z',
  });
  assert.equal(dgfip.tvaVerificationStatus, TVA_VERIFICATION_STATUSES.VERIFIED_DGFIP);
  assert.equal(validate(dgfip, { requireVerifiedVatNumber: true }).isValid, true);

  const vies = buildVatPatchFromLookup({
    outcome: VAT_LOOKUP_OUTCOMES.VERIFIED,
    vatNumber: 'FR22820001014',
    source: 'vies',
    siren: SIREN,
    checkedAt: '2026-07-30T09:15:00.000Z',
  });
  assert.equal(vies.tvaVerificationStatus, TVA_VERIFICATION_STATUSES.VERIFIED_VIES);
  assert.equal(validate(vies, { requireVerifiedVatNumber: true }).isValid, true);

  // Source inconnue : aucun statut vérifié accordé.
  const unknownSource = buildVatPatchFromLookup({
    outcome: VAT_LOOKUP_OUTCOMES.VERIFIED,
    vatNumber: 'FR22820001014',
    source: 'un-tiers',
    siren: SIREN,
  });
  assert.equal(
    unknownSource.tvaVerificationStatus,
    TVA_VERIFICATION_STATUSES.CALCULATED_UNVERIFIED
  );
});

run('un numéro déclaré non confirmé par VIES est conservé, non vérifié', () => {
  // VIES ne référence que les numéros valides en intracommunautaire : son
  // silence ne doit ni effacer le numéro communiqué, ni le remplacer par celui
  // que la formule calcule depuis le SIREN.
  const foreignNumber = 'BE0123456789';
  const patch = buildVatPatchFromLookup({
    outcome: VAT_LOOKUP_OUTCOMES.UNAVAILABLE,
    siren: SIREN,
    declaredNumber: foreignNumber,
  });

  assert.equal(patch.tvaIntra, foreignNumber);
  assert.notEqual(patch.tvaIntra, computeFrenchVatNumber(SIREN));
  assert.equal(patch.tvaVerificationStatus, TVA_VERIFICATION_STATUSES.CALCULATED_UNVERIFIED);

  const quote = validate(patch);
  assert.equal(quote.isValid, true);
  assert.deepEqual(quote.warnings, [CALCULATED_UNVERIFIED_ALERT]);
  assert.equal(validate(patch, { requireVerifiedVatNumber: true }).isValid, false);
});

run("l'alerte de numéro non vérifié est celle attendue", () => {
  assert.ok(CALCULATED_UNVERIFIED_ALERT.includes('prérempli depuis le SIREN'));
  assert.ok(CALCULATED_UNVERIFIED_ALERT.includes('source officielle'));
});

console.log('Tous les tests de vérification du n° de TVA ont reussi.');
