'use client';

import { useEffect, useState } from 'react';
import usePdfProgress from './usePdfProgress';
import styles from './QuoteSummary.module.css';

/**
 * Loader plein écran « volet roulant » SARANGE, réutilisé partout où une opération
 * longue est en cours (génération PDF d'un devis, signature…). On peut faire défiler
 * une liste de messages rassurants : ils tournent automatiquement.
 *
 * Pictogramme en HTML/CSS pur, géométrie entièrement en pixels. Seul le tablier
 * bouge, par un `transform` en px sur sa propre couche : c'est la seule forme
 * d'animation que le navigateur exécute sur le GPU, indépendamment du fil
 * principal (occupé par la génération du PDF). Aucune valeur en pourcentage dans
 * les keyframes : Chrome refuse de composer une animation dont la valeur dépend
 * de la taille de la boîte, et la ferait alors tourner sur le fil principal,
 * donc figée pendant le travail lourd.
 *
 * Barre de progression : suit l'avancement réel publié par lib/pdf-generator.js
 * tant qu'un PDF se construit ; sinon (envoi, signature côté serveur) elle
 * devient indéterminée.
 */
export default function PdfGenerationLoader({
  title = 'Création du devis',
  messages = ['Veuillez patienter...'],
}) {
  const list = Array.isArray(messages) && messages.length ? messages : ['Veuillez patienter...'];
  const [index, setIndex] = useState(0);
  const progress = usePdfProgress();
  const percent = progress == null ? null : Math.round(progress * 100);

  useEffect(() => {
    if (list.length <= 1) return undefined;
    const id = setInterval(() => {
      setIndex((current) => (current + 1) % list.length);
    }, 2200);
    return () => clearInterval(id);
  }, [list.length]);

  return (
    <div
      className={styles.loaderOverlay}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={title}
    >
      <div className={styles.loaderCard}>
        <div className={styles.loaderWrapper}>
          <div className={styles.icon} aria-hidden="true">
            <div className={styles.iconFrame}>
              <div className={styles.iconGlass} />
              <div className={styles.iconShine} />
              <div className={styles.iconMullionV} />
              <div className={styles.iconMullionH} />
              <div className={styles.iconShutter}>
                <div className={styles.iconSlats} />
                <div className={styles.iconLame} />
              </div>
            </div>
            <div className={styles.iconBox} />
          </div>

          <div className="text-center">
            <p className="m-0 text-sm font-black uppercase tracking-[0.24em] text-slate-900 sm:text-base">
              {title}
            </p>
            <p key={index} className={styles.subtitle}>
              {list[index]}
            </p>
          </div>

          <div
            className={styles.progress}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent ?? undefined}
          >
            <div className={styles.progressTrack}>
              {percent == null ? (
                <div className={styles.progressIndeterminate} />
              ) : (
                <div
                  className={styles.progressFill}
                  style={{ transform: `scaleX(${progress})` }}
                />
              )}
            </div>
            <span className={styles.progressLabel}>
              {percent == null ? 'En cours' : `${percent} %`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
