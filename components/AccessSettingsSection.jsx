'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Crown,
  Loader2,
  Lock,
  LockOpen,
  Mail,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';

import { useFirebaseAuth } from '@/components/FirebaseProvider';
import {
  ACCESS_ROLES,
  buildAccessInvitationText,
  normalizeEmail,
} from '@/lib/access-rules.mjs';
import { isEmailAddress } from '@/lib/email-recipients.mjs';
import { PUBLIC_BASE_URL } from '@/lib/public-base-url.mjs';

const formatDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
};

const providerLabel = (providers = []) => {
  if (providers.includes('google.com')) return 'Google';
  if (providers.includes('password')) return 'E-mail / mot de passe';
  return providers[0] || '';
};

/**
 * Statut du compte connecté : adresse, rôle, état de la vérification serveur.
 * Affiché à tous. Si la vérification n'a pas pu aboutir (réseau, serveur), on
 * le dit et on propose de réessayer plutôt que de masquer silencieusement la
 * gestion des comptes.
 */
function AccountStatusCard({ user, access, onRetry, retrying }) {
  const email = normalizeEmail(user?.email);
  const isAdmin = access?.isAdmin === true;
  const checked = access?.checked === true;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 text-sm">
        <p className="text-xs font-black uppercase tracking-widest text-slate-400">Votre compte</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="truncate font-semibold text-slate-800">{email || 'adresse inconnue'}</span>
          {checked && isAdmin && (
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-bold text-orange-700">
              <Crown size={11} />
              Administrateur
            </span>
          )}
          {checked && !isAdmin && (
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-600">Utilisateur</span>
          )}
          {!checked && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
              Rôle non vérifié
            </span>
          )}
        </div>
        {!checked && (
          <p className="mt-1 text-xs text-amber-700">
            La vérification du rôle auprès du serveur n&apos;a pas abouti (réseau ou serveur indisponible). Vous
            pouvez utiliser l&apos;application normalement ; la gestion des comptes s&apos;affichera après une nouvelle
            vérification.
          </p>
        )}
        {checked && !isAdmin && (
          <p className="mt-1 text-xs text-slate-500">
            La gestion des comptes est réservée aux administrateurs. Demandez à un administrateur de vous
            attribuer ce rôle si nécessaire.
          </p>
        )}
      </div>
      {!checked && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-60"
        >
          {retrying ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          Réessayer
        </button>
      )}
    </div>
  );
}

/**
 * Paramètres > Accès à l'application. Statut du compte pour tous ; gestion des
 * comptes pour les administrateurs (contact@sarange.fr via DEVIS_ADMIN_EMAILS,
 * plus ceux promus ici).
 *
 * Flux « nouveau collaborateur » : il se connecte avec son compte Google, il
 * est refusé (si la restriction est active) mais son compte apparaît dans
 * « Comptes connus » ; l'administrateur clique « Autoriser », copie
 * l'invitation, c'est terminé. Ou bien on saisit l'adresse à l'avance.
 */
export default function AccessSettingsSection() {
  const { user, access, refreshAccess } = useFirebaseAuth();
  const isAdmin = Boolean(user) && access?.isAdmin === true;

  const [view, setView] = useState(null);
  const [error, setError] = useState('');
  const [pendingKey, setPendingKey] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState(ACCESS_ROLES.USER);
  const [copiedKey, setCopiedKey] = useState('');
  const [showAllKnown, setShowAllKnown] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const request = useCallback(
    async (method, body) => {
      if (!user) throw new Error('Non connecté.');
      const idToken = await user.getIdToken();
      const response = await fetch('/api/access', {
        method,
        headers: {
          Authorization: `Bearer ${idToken}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'Une erreur est survenue.');
      }
      return payload;
    },
    [user]
  );

  useEffect(() => {
    if (!isAdmin) return undefined;
    let cancelled = false;
    request('GET')
      .then((payload) => {
        if (cancelled) return;
        setView(payload);
        setError('');
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError.message);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, request]);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await refreshAccess?.();
    } finally {
      setRetrying(false);
    }
  };

  const act = async (key, body) => {
    setPendingKey(key);
    setError('');
    try {
      const payload = await request('POST', body);
      setView(payload);
      return true;
    } catch (requestError) {
      setError(requestError.message);
      return false;
    } finally {
      setPendingKey('');
    }
  };

  const handleAdd = async (event) => {
    event.preventDefault();
    const email = normalizeEmail(newEmail);
    if (!isEmailAddress(email)) {
      setError(`« ${newEmail.trim() || 'vide'} » n'est pas une adresse e-mail valide.`);
      return;
    }
    const done = await act(`add:${email}`, { action: 'add', email, role: newRole });
    if (done) {
      setNewEmail('');
      setNewRole(ACCESS_ROLES.USER);
    }
  };

  const copyInvitation = async (email) => {
    const text = buildAccessInvitationText({ email, appUrl: PUBLIC_BASE_URL });
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(email);
      setTimeout(() => setCopiedKey(''), 1800);
    } catch {
      window.prompt("Copiez l'invitation :", text);
    }
  };

  const entries = useMemo(() => {
    if (!view) return [];
    const map = new Map();
    const push = (email, role, source) => {
      const key = normalizeEmail(email);
      if (!key) return;
      const existing = map.get(key);
      if (existing) {
        if (role === ACCESS_ROLES.ADMIN) existing.role = ACCESS_ROLES.ADMIN;
        existing.sources.add(source);
        return;
      }
      map.set(key, { email: key, role, sources: new Set([source]) });
    };
    (view.envAdmins || []).forEach((email) => push(email, ACCESS_ROLES.ADMIN, 'env'));
    (view.admins || []).forEach((email) => push(email, ACCESS_ROLES.ADMIN, 'app'));
    (view.envAllowedEmails || []).forEach((email) => push(email, ACCESS_ROLES.USER, 'env'));
    (view.allowedEmails || []).forEach((email) => push(email, ACCESS_ROLES.USER, 'app'));
    return Array.from(map.values()).sort((a, b) => {
      if (a.role !== b.role) return a.role === ACCESS_ROLES.ADMIN ? -1 : 1;
      return a.email.localeCompare(b.email);
    });
  }, [view]);

  const listedEmails = useMemo(() => new Set(entries.map((entry) => entry.email)), [entries]);

  const unlistedAccounts = useMemo(
    () => (view?.knownAccounts || []).filter((account) => !listedEmails.has(account.email) && !account.disabled),
    [view, listedEmails]
  );

  const lastSignInByEmail = useMemo(() => {
    const map = new Map();
    (view?.knownAccounts || []).forEach((account) => map.set(account.email, account.lastSignInAt));
    return map;
  }, [view]);

  if (!user) return null;

  const enforced = view?.enforced === true;
  const envRestricts = (view?.envAllowedEmails || []).length > 0;
  const restricted = enforced || envRestricts;
  const currentEmail = view?.currentEmail || normalizeEmail(user?.email);
  const visibleUnlisted = showAllKnown ? unlistedAccounts : unlistedAccounts.slice(0, 6);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <div className="rounded-xl bg-orange-100 p-2 text-orange-600">
          <ShieldCheck size={18} />
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-orange-500">Accès à l&apos;application</p>
          <h3 className="text-lg font-bold text-slate-900">Comptes autorisés</h3>
        </div>
      </div>

      <AccountStatusCard user={user} access={access} onRetry={handleRetry} retrying={retrying} />

      {isAdmin && (
        <div className="mt-5 space-y-5">
          <p className="text-sm text-slate-500">
            Chaque compte autorisé dispose de son propre espace (devis, clients, catalogue), totalement séparé des
            autres. Pour autoriser un nouveau collaborateur : saisissez son adresse Gmail ci-dessous, ou attendez
            qu&apos;il tente de se connecter puis cliquez « Autoriser » dans les comptes connus. Envoyez-lui ensuite
            l&apos;invitation.
          </p>

          {!view && !error && (
            <div className="flex items-center gap-2 py-4 text-sm text-slate-400">
              <Loader2 size={16} className="animate-spin" />
              Chargement des comptes…
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {view && (
            <>
              {/* Restriction */}
              <div
                className={`flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
                  restricted ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'
                }`}
              >
                <div className="flex items-start gap-3">
                  {restricted ? (
                    <Lock size={18} className="mt-0.5 shrink-0 text-emerald-600" />
                  ) : (
                    <LockOpen size={18} className="mt-0.5 shrink-0 text-amber-600" />
                  )}
                  <div className="text-sm">
                    <p className={`font-bold ${restricted ? 'text-emerald-900' : 'text-amber-900'}`}>
                      {restricted
                        ? 'Accès restreint : seuls les comptes listés peuvent se connecter.'
                        : "Accès ouvert : n'importe quel compte Google peut se connecter."}
                    </p>
                    <p className={restricted ? 'text-emerald-800' : 'text-amber-800'}>
                      {restricted
                        ? 'Un compte inconnu est déconnecté immédiatement avec un message explicite. Vous restez toujours reconnu comme administrateur.'
                        : "Un inconnu obtient seulement un espace vide (jamais vos devis). Activez la restriction pour n'accepter que la liste ci-dessous."}
                    </p>
                    {envRestricts && !enforced && (
                      <p className="mt-1 text-xs text-emerald-700">
                        Restriction imposée par la variable Vercel NEXT_PUBLIC_DEVIS_ALLOWED_EMAILS.
                      </p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void act('enforce', { action: 'set-enforced', enforced: !enforced })}
                  disabled={pendingKey === 'enforce'}
                  className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors disabled:opacity-60 ${
                    enforced
                      ? 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  {pendingKey === 'enforce' ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : enforced ? (
                    <LockOpen size={15} />
                  ) : (
                    <Lock size={15} />
                  )}
                  {enforced ? 'Rouvrir l’accès' : 'Restreindre l’accès'}
                </button>
              </div>

              {/* Ajout */}
              <form onSubmit={handleAdd} className="flex flex-col gap-2 sm:flex-row">
                <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 focus-within:border-orange-300">
                  <Mail size={15} className="shrink-0 text-slate-400" />
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(event) => setNewEmail(event.target.value)}
                    placeholder="adresse@gmail.com"
                    autoComplete="off"
                    className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                  />
                </label>
                <select
                  value={newRole}
                  onChange={(event) => setNewRole(event.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                >
                  <option value={ACCESS_ROLES.USER}>Utilisateur</option>
                  <option value={ACCESS_ROLES.ADMIN}>Administrateur</option>
                </select>
                <button
                  type="submit"
                  disabled={pendingKey.startsWith('add:') || !newEmail.trim()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {pendingKey.startsWith('add:') ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
                  Autoriser
                </button>
              </form>

              {/* Liste */}
              <div>
                <p className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400">
                  <Users size={14} />
                  Comptes autorisés ({entries.length})
                </p>
                {entries.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-400">
                    Aucun compte listé pour l&apos;instant.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {entries.map((entry) => {
                      const isSelf = entry.email === currentEmail;
                      const fromEnvOnly = entry.sources.has('env') && !entry.sources.has('app');
                      const lastSignIn = formatDateTime(lastSignInByEmail.get(entry.email));
                      const roleKey = `role:${entry.email}`;
                      const removeKey = `remove:${entry.email}`;
                      return (
                        <li key={entry.email} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="truncate text-sm font-semibold text-slate-800">{entry.email}</span>
                              {entry.role === ACCESS_ROLES.ADMIN ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-bold text-orange-700">
                                  <Crown size={11} />
                                  Administrateur
                                </span>
                              ) : (
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                                  Utilisateur
                                </span>
                              )}
                              {isSelf && (
                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                                  vous
                                </span>
                              )}
                              {fromEnvOnly && (
                                <span
                                  title="Défini dans les variables d'environnement Vercel : modifiable seulement là-bas."
                                  className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500"
                                >
                                  Vercel
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-400">
                              {lastSignIn ? `Dernière connexion : ${lastSignIn}` : 'Ne s’est encore jamais connecté'}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => void copyInvitation(entry.email)}
                              title="Copier le message d'invitation"
                              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                                copiedKey === entry.email
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              {copiedKey === entry.email ? <Check size={13} /> : <Copy size={13} />}
                              {copiedKey === entry.email ? 'Copié !' : 'Invitation'}
                            </button>
                            {!fromEnvOnly && !isSelf && (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void act(roleKey, {
                                      action: 'add',
                                      email: entry.email,
                                      role: entry.role === ACCESS_ROLES.ADMIN ? ACCESS_ROLES.USER : ACCESS_ROLES.ADMIN,
                                    })
                                  }
                                  disabled={pendingKey === roleKey}
                                  title={entry.role === ACCESS_ROLES.ADMIN ? 'Retirer le rôle administrateur' : 'Rendre administrateur'}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60"
                                >
                                  {pendingKey === roleKey ? <Loader2 size={13} className="animate-spin" /> : <Crown size={13} />}
                                  {entry.role === ACCESS_ROLES.ADMIN ? 'Simple utilisateur' : 'Admin'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (window.confirm(`Retirer l'accès de ${entry.email} ? Ses données restent conservées.`)) {
                                      void act(removeKey, { action: 'remove', email: entry.email });
                                    }
                                  }}
                                  disabled={pendingKey === removeKey}
                                  title="Retirer l'accès"
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
                                >
                                  {pendingKey === removeKey ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                                  Retirer
                                </button>
                              </>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Comptes connus non listés */}
              {unlistedAccounts.length > 0 && (
                <div>
                  <p className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400">
                    <Users size={14} />
                    Comptes connus non autorisés ({unlistedAccounts.length})
                  </p>
                  <p className="mb-2 text-xs text-slate-400">
                    Comptes qui se sont déjà connectés à une application SARANGE (projet Firebase commun). Un
                    collaborateur refusé à la connexion apparaît ici : autorisez-le en un clic.
                  </p>
                  <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {visibleUnlisted.map((account) => {
                      const addKey = `add:${account.email}`;
                      const lastSignIn = formatDateTime(account.lastSignInAt || account.createdAt);
                      return (
                        <li key={account.email} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="truncate text-sm font-semibold text-slate-800">{account.email}</span>
                              {account.displayName && (
                                <span className="truncate text-xs text-slate-500">{account.displayName}</span>
                              )}
                              {providerLabel(account.providers) && (
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                                  {providerLabel(account.providers)}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-400">
                              {lastSignIn ? `Dernière connexion : ${lastSignIn}` : ''}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void act(addKey, { action: 'add', email: account.email, role: ACCESS_ROLES.USER })}
                            disabled={pendingKey === addKey}
                            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
                          >
                            {pendingKey === addKey ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />}
                            Autoriser
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {unlistedAccounts.length > 6 && (
                    <button
                      type="button"
                      onClick={() => setShowAllKnown((value) => !value)}
                      className="mt-2 text-xs font-semibold text-slate-500 underline-offset-2 hover:underline"
                    >
                      {showAllKnown ? 'Réduire' : `Voir les ${unlistedAccounts.length - 6} autres`}
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
