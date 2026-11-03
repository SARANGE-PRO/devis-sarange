'use client';

import { useEffect, useState } from 'react';
import styles from './QuoteSummary.module.css';

/**
 * Loader plein écran « volet roulant » SARANGE, réutilisé partout où une opération
 * longue est en cours (génération PDF d'un devis, signature…). On peut faire défiler
 * une liste de messages rassurants : ils tournent automatiquement.
 *
 * Dessin en HTML/CSS pur (pas de SVG) : seules des propriétés composées par le GPU
 * sont animées (transform, opacity). L'animation continue donc de tourner sans
 * saccade pendant que la génération du PDF occupe le fil principal, et Safari ne
 * bute plus sur un transform appliqué à un groupe SVG découpé.
 */
export default function PdfGenerationLoader({
  title = 'Création du devis',
  messages = ['Veuillez patienter...'],
}) {
  const list = Array.isArray(messages) && messages.length ? messages : ['Veuillez patienter...'];
  const [index, setIndex] = useState(0);

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
          <div className={styles.iconContainer} aria-hidden="true">
            <div className={styles.windowFrame}>
              <div className={styles.windowGlass} />
              <div className={styles.windowReflection} />
              <div className={styles.mullionVertical} />
              <div className={styles.mullionHorizontal} />
              <div className={styles.shutter}>
                <div className={styles.shutterSlats} />
                <div className={styles.shutterLame} />
              </div>
            </div>
            <div className={styles.shutterBox} />
          </div>

          <div className="text-center">
            <p className="m-0 text-sm font-black uppercase tracking-[0.24em] text-slate-900 sm:text-base">
              {title}
            </p>
            <p key={index} className={styles.subtitle}>
              {list[index]}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
