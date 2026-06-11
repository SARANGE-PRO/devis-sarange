import nextEnv from '@next/env';
import { cert, initializeApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import nodemailer from 'nodemailer';

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const normalizeEnv = (value) =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';

const parseServiceAccount = () => {
  const rawJson = normalizeEnv(process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON);
  if (rawJson) {
    const parsed = JSON.parse(rawJson);
    return {
      projectId: normalizeEnv(parsed.project_id || parsed.projectId),
      clientEmail: normalizeEnv(parsed.client_email || parsed.clientEmail),
      privateKey: normalizeEnv(parsed.private_key || parsed.privateKey).replace(/\\n/g, '\n'),
    };
  }

  const projectId = normalizeEnv(
    process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  );
  const clientEmail = normalizeEnv(process.env.FIREBASE_ADMIN_CLIENT_EMAIL);
  const privateKey = normalizeEnv(process.env.FIREBASE_ADMIN_PRIVATE_KEY).replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  return {
    projectId,
    clientEmail,
    privateKey,
  };
};

async function testConfiguration() {
  console.log('--- TEST CONFIGURATION ---');

  try {
    const serviceAccount = parseServiceAccount();
    const storageBucket = normalizeEnv(
      process.env.FIREBASE_ADMIN_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
    );

    if (!serviceAccount) {
      throw new Error(
        'Configuration Firebase Admin incomplete: set FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON or PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY.'
      );
    }

    if (!storageBucket) {
      throw new Error(
        'Configuration Firebase Storage incomplete: set FIREBASE_ADMIN_STORAGE_BUCKET or NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET.'
      );
    }

    initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.projectId,
      storageBucket,
    });

    console.log(`Firebase Admin: configuration valide (bucket: ${storageBucket}).`);

    const bucket = getStorage().bucket();
    const [exists] = await bucket.exists();
    if (!exists) {
      throw new Error(`Bucket Firebase introuvable: ${storageBucket}`);
    }

    console.log(`Firebase Storage: bucket accessible (${bucket.name}).`);
  } catch (error) {
    console.error('Firebase Admin erreur:', error.message);
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.verify();
    console.log('SMTP Nodemailer: connexion reussie au serveur email.');
  } catch (error) {
    console.error('SMTP Nodemailer erreur:', error.message);
  }
}

testConfiguration();
