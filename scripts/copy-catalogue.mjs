// Copie ponctuelle de la config catalogue (coefficients, prix, vitrages custom)
// d'un utilisateur vers un autre, via le SDK Admin Firebase.
//
// Usage (les variables d'env Admin doivent être chargées) :
//   node --env-file=.env.local scripts/copy-catalogue.mjs <UID_SOURCE> <UID_DESTINATION>
//   node --env-file=.env.local scripts/copy-catalogue.mjs <UID_SOURCE> <UID_DESTINATION> --dry-run
//
// Le document copié est users/{UID}/catalogue/config.
// ATTENTION : copie ponctuelle. Les futures modifications de prix du compte source
// ne seront PAS répercutées automatiquement sur le compte destination.

import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const normalize = (value) =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';

const parseServiceAccount = () => {
  const rawJson = normalize(process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON);
  if (rawJson) {
    const parsed = JSON.parse(rawJson);
    return {
      projectId: normalize(parsed.project_id || parsed.projectId),
      clientEmail: normalize(parsed.client_email || parsed.clientEmail),
      privateKey: normalize(parsed.private_key || parsed.privateKey).replace(/\\n/g, '\n'),
    };
  }

  const projectId = normalize(
    process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  );
  const clientEmail = normalize(process.env.FIREBASE_ADMIN_CLIENT_EMAIL);
  const privateKey = normalize(process.env.FIREBASE_ADMIN_PRIVATE_KEY).replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) return null;
  return { projectId, clientEmail, privateKey };
};

const main = async () => {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const [sourceUid, destUid] = args.filter((a) => !a.startsWith('--'));

  if (!sourceUid || !destUid) {
    console.error(
      'Usage: node --env-file=.env.local scripts/copy-catalogue.mjs <UID_SOURCE> <UID_DESTINATION> [--dry-run]'
    );
    process.exit(1);
  }

  if (sourceUid === destUid) {
    console.error('Erreur : UID source et destination identiques.');
    process.exit(1);
  }

  const serviceAccount = parseServiceAccount();
  if (!serviceAccount) {
    console.error(
      'Firebase Admin non configuré. Renseignez FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON ' +
        'ou FIREBASE_ADMIN_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY dans .env.local.'
    );
    process.exit(1);
  }

  const app = getApps().length
    ? getApps()[0]
    : initializeApp({ credential: cert(serviceAccount), projectId: serviceAccount.projectId });
  const db = getFirestore(app);

  const sourceRef = db.doc(`users/${sourceUid}/catalogue/config`);
  const destRef = db.doc(`users/${destUid}/catalogue/config`);

  const sourceSnap = await sourceRef.get();
  if (!sourceSnap.exists) {
    console.error(`Aucun catalogue trouvé pour le compte source (users/${sourceUid}/catalogue/config).`);
    console.error('Le compte source utilise peut-être le catalogue de base (aucune personnalisation cloud).');
    process.exit(1);
  }

  const data = sourceSnap.data();
  const destSnap = await destRef.get();

  console.log(`Source      : users/${sourceUid}/catalogue/config`);
  console.log(`Destination : users/${destUid}/catalogue/config`);
  console.log(`Champs copiés : ${Object.keys(data).join(', ') || '(aucun)'}`);
  console.log(`Destination existe déjà : ${destSnap.exists ? 'OUI (sera fusionnée)' : 'non'}`);

  if (dryRun) {
    console.log('\n[dry-run] Aucune écriture effectuée.');
    process.exit(0);
  }

  await destRef.set({ ...data, updatedAt: new Date() }, { merge: true });
  console.log('\n✅ Catalogue copié avec succès.');
  process.exit(0);
};

main().catch((error) => {
  console.error('Échec :', error);
  process.exit(1);
});
