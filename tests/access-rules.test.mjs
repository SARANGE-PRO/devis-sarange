import assert from 'node:assert/strict';
import {
  applyAccessAction,
  buildAccessInvitationText,
  describeAccessDenial,
  evaluateAccess,
  normalizeAccessConfig,
  parseEmailList,
} from '../lib/access-rules.mjs';

const run = (name, fn) => {
  try {
    fn();
    console.log(`OK - ${name}`);
  } catch (error) {
    console.error(`KO - ${name}`);
    throw error;
  }
};

run('listes d’adresses : nettoyage, casse, doublons', () => {
  assert.deepEqual(parseEmailList(' A@b.fr, a@B.FR ; c@d.fr\npas-une-adresse'), ['a@b.fr', 'c@d.fr']);
  assert.deepEqual(parseEmailList(['X@y.fr']), ['x@y.fr']);
  assert.deepEqual(parseEmailList(''), []);
  assert.deepEqual(normalizeAccessConfig(null), { enforced: false, allowedEmails: [], admins: [] });
});

run('liste non appliquée et environnement vide : accès ouvert (comportement historique)', () => {
  const result = evaluateAccess({ email: 'quelqun@gmail.com', config: null });
  assert.equal(result.allowed, true);
  assert.equal(result.reason, 'open');
  assert.equal(result.isAdmin, false);
  assert.equal(result.enforced, false);
});

run('administrateur : toujours reconnu, via l’environnement ou le document', () => {
  const viaEnv = evaluateAccess({ email: 'Contact@Sarange.fr', config: { enforced: true }, envAdmins: 'contact@sarange.fr' });
  assert.equal(viaEnv.allowed, true);
  assert.equal(viaEnv.isAdmin, true);

  const viaDoc = evaluateAccess({ email: 'chef@gmail.com', config: { enforced: true, admins: ['chef@gmail.com'] } });
  assert.equal(viaDoc.isAdmin, true);
});

run('adresse non vérifiée : aucun droit nominatif (ni admin, ni liste)', () => {
  const config = { enforced: true, allowedEmails: ['poseur@gmail.com'] };
  const impostorAdmin = evaluateAccess({ email: 'contact@sarange.fr', emailVerified: false, config, envAdmins: 'contact@sarange.fr' });
  assert.equal(impostorAdmin.allowed, false);
  assert.equal(impostorAdmin.isAdmin, false);
  assert.equal(impostorAdmin.reason, 'unverified');

  const impostorUser = evaluateAccess({ email: 'poseur@gmail.com', emailVerified: false, config });
  assert.equal(impostorUser.reason, 'unverified');

  // Accès ouvert : le compte entre comme n'importe qui, sans rôle.
  const open = evaluateAccess({ email: 'contact@sarange.fr', emailVerified: false, config: null, envAdmins: 'contact@sarange.fr' });
  assert.equal(open.allowed, true);
  assert.equal(open.isAdmin, false);
});

run('liste appliquée : seules les adresses listées passent', () => {
  const config = { enforced: true, allowedEmails: ['poseur@gmail.com'] };
  assert.equal(evaluateAccess({ email: 'poseur@gmail.com', config }).allowed, true);
  const refused = evaluateAccess({ email: 'inconnu@gmail.com', config });
  assert.equal(refused.allowed, false);
  assert.equal(refused.reason, 'not-listed');
  assert.equal(refused.enforced, true);
  assert.equal(evaluateAccess({ email: '', config }).reason, 'no-email');
});

run('liste d’environnement historique : fait foi même sans application dans l’app', () => {
  const env = 'a@sarange.fr, b@gmail.com';
  assert.equal(evaluateAccess({ email: 'b@gmail.com', config: null, envAllowed: env }).allowed, true);
  const refused = evaluateAccess({ email: 'c@gmail.com', config: null, envAllowed: env });
  assert.equal(refused.allowed, false);
  assert.equal(refused.enforced, true);
  // Une adresse ajoutée dans l'app passe aussi.
  assert.equal(
    evaluateAccess({ email: 'c@gmail.com', config: { allowedEmails: ['c@gmail.com'] }, envAllowed: env }).allowed,
    true
  );
});

run('actions d’administration : ajout, rôle, retrait, application', () => {
  let config = normalizeAccessConfig(null);
  config = applyAccessAction(config, { action: 'add', email: ' Poseur@Gmail.com ' });
  assert.deepEqual(config.allowedEmails, ['poseur@gmail.com']);

  // Passage en administrateur : une seule place, jamais dans les deux listes.
  config = applyAccessAction(config, { action: 'add', email: 'poseur@gmail.com', role: 'admin' });
  assert.deepEqual(config.allowedEmails, []);
  assert.deepEqual(config.admins, ['poseur@gmail.com']);

  config = applyAccessAction(config, { action: 'set-enforced', enforced: true });
  assert.equal(config.enforced, true);

  config = applyAccessAction(config, { action: 'remove', email: 'poseur@gmail.com' });
  assert.deepEqual(config.admins, []);

  assert.throws(() => applyAccessAction(config, { action: 'add', email: 'pas-une-adresse' }), /valide/);
  assert.throws(() => applyAccessAction(config, { action: 'autre', email: 'a@b.fr' }), /inconnue/);
});

run('un administrateur ne peut ni se retirer ni se rétrograder', () => {
  const config = { admins: ['chef@gmail.com'] };
  assert.throws(
    () => applyAccessAction(config, { action: 'remove', email: 'Chef@gmail.com', actorEmail: 'chef@gmail.com' }),
    /propre accès/
  );
  assert.throws(
    () => applyAccessAction(config, { action: 'add', email: 'chef@gmail.com', role: 'user', actorEmail: 'chef@gmail.com' }),
    /administrateur/
  );
  // Un autre administrateur peut le faire.
  const next = applyAccessAction(config, { action: 'remove', email: 'chef@gmail.com', actorEmail: 'autre@gmail.com' });
  assert.deepEqual(next.admins, []);
});

run('messages : refus et invitation', () => {
  assert.match(describeAccessDenial({ email: 'X@y.fr', reason: 'not-listed' }), /x@y\.fr .*n'est pas autorisé/);
  assert.match(describeAccessDenial({ email: 'x@y.fr', reason: 'unverified' }), /pas vérifiée/);
  const invitation = buildAccessInvitationText({ email: 'Poseur@Gmail.com', appUrl: 'https://devis.sarange.fr' });
  assert.match(invitation, /https:\/\/devis\.sarange\.fr/);
  assert.match(invitation, /poseur@gmail\.com/);
});

console.log('Tous les tests des règles d’accès ont reussi.');
