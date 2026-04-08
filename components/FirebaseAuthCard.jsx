'use client';

import { useMemo, useState } from 'react';
import { Loader2, LockKeyhole, Mail, UserRound } from 'lucide-react';
import { useFirebaseAuth } from '@/components/FirebaseProvider';

export default function FirebaseAuthCard({
  title = 'Connexion cloud',
  subtitle = 'Connectez-vous pour retrouver et modifier vos devis de partout.',
}) {
  const { signIn, signInWithGoogle, signUp, isConfigured } = useFirebaseAuth();
  const [mode, setMode] = useState('signin');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const submitLabel = useMemo(
    () => (mode === 'signin' ? 'Se connecter' : 'Creer mon acces'),
    [mode]
  );

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (mode === 'signup' && password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }

    setLoading(true);

    try {
      if (mode === 'signin') {
        await signIn({ email, password });
      } else {
        await signUp({ displayName, email, password });
      }
      setPassword('');
      setConfirmPassword('');
    } catch (submissionError) {
      setError(submissionError.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setGoogleLoading(true);

    try {
      await signInWithGoogle();
    } catch (submissionError) {
      setError(submissionError.message);
    } finally {
      setGoogleLoading(false);
    }
  };

  if (!isConfigured) {
    return (
      <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5 text-sm text-orange-900 shadow-sm">
        Completez d&apos;abord les variables Firebase du projet pour activer Mes devis.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-orange-500">
            Firebase
          </p>
          <h3 className="mt-1 text-lg font-bold text-slate-900">{title}</h3>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
        <div className="rounded-2xl bg-slate-100 p-3 text-slate-500">
          <LockKeyhole size={18} />
        </div>
      </div>

      <div className="mt-5 inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 text-sm font-semibold">
        <button
          type="button"
          onClick={() => setMode('signin')}
          className={`rounded-lg px-4 py-2 transition-colors ${
            mode === 'signin'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          Connexion
        </button>
        <button
          type="button"
          onClick={() => setMode('signup')}
          className={`rounded-lg px-4 py-2 transition-colors ${
            mode === 'signup'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          Creer un compte
        </button>
      </div>

      <div className="mt-5">
        <button
          type="button"
          onClick={() => void handleGoogleSignIn()}
          disabled={googleLoading || loading}
          className="inline-flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition-colors hover:border-orange-300 hover:text-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {googleLoading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] font-black text-white">
              G
            </span>
          )}
          Continuer avec Google
        </button>
        <p className="mt-2 text-xs text-slate-400">
          Utilisez cette option si votre email existe deja via votre autre application Firebase.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        {mode === 'signup' && (
          <label className="block">
            <span className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <UserRound size={14} className="text-slate-400" />
              Nom affiche
            </span>
            <input
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Ex : Bureau Sarange"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
            />
          </label>
        )}

        <label className="block">
          <span className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Mail size={14} className="text-slate-400" />
            Email
          </span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="vous@sarange.fr"
            autoComplete="email"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
            required
          />
        </label>

        <label className="block">
          <span className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <LockKeyhole size={14} className="text-slate-400" />
            Mot de passe
          </span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
            required
          />
        </label>

        {mode === 'signup' && (
          <label className="block">
            <span className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <LockKeyhole size={14} className="text-slate-400" />
              Confirmation
            </span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
              required
            />
          </label>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || googleLoading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading && <Loader2 size={16} className="animate-spin" />}
          {submitLabel}
        </button>
      </form>
    </div>
  );
}
