'use client';

import { useEffect, useState } from 'react';
import styles from './QuoteSummary.module.css';

/**
 * Loader plein écran « volet roulant » SARANGE, réutilisé partout où une opération
 * longue est en cours (génération PDF d'un devis, signature…). On peut faire défiler
 * une liste de messages rassurants : ils tournent automatiquement.
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
    }, 2000);
    return () => clearInterval(id);
  }, [list.length]);

  return (
    <div
      className={styles.loaderOverlay}
      role="status"
      aria-live="polite"
      aria-label={title}
    >
      <div className={styles.loaderCard}>
        <div className={styles.loaderWrapper}>
          <div className={styles.iconContainer} aria-hidden="true">
            <svg
              viewBox="0 0 100 100"
              xmlns="http://www.w3.org/2000/svg"
              className={styles.loaderSvg}
            >
              <defs>
                <clipPath id="quote-loader-window-clip">
                  <rect x="14" y="24" width="72" height="66" />
                </clipPath>
              </defs>

              <rect x="10" y="10" width="80" height="80" rx="3" fill="none" stroke="#1A1A1A" strokeWidth="5" />
              <rect x="15" y="15" width="70" height="70" fill="#FFFFFF" />
              <line x1="50" y1="15" x2="50" y2="85" stroke="#1A1A1A" strokeWidth="3" />
              <line x1="15" y1="50" x2="85" y2="50" stroke="#1A1A1A" strokeWidth="3" />
              <polygon points="15,45 45,15 60,15 15,60" fill="#F0F0F0" fillOpacity="0.8" />
              <polygon points="15,85 85,15 90,15 15,90" fill="#F0F0F0" fillOpacity="0.5" />

              <g clipPath="url(#quote-loader-window-clip)">
                <g className={styles.shutter}>
                  <rect x="15" y="25" width="70" height="7" fill="#FF5F1F" />
                  <rect x="15" y="33" width="70" height="7" fill="#FF5F1F" />
                  <rect x="15" y="41" width="70" height="7" fill="#FF5F1F" />
                  <rect x="15" y="49" width="70" height="7" fill="#FF5F1F" />
                  <rect x="15" y="57" width="70" height="7" fill="#FF5F1F" />
                  <rect x="15" y="65" width="70" height="7" fill="#FF5F1F" />
                  <rect x="15" y="73" width="70" height="7" fill="#FF5F1F" />
                  <rect x="15" y="81" width="70" height="9" fill="#1A1A1A" />
                </g>
              </g>

              <rect x="8" y="8" width="84" height="18" rx="2" fill="#1A1A1A" />
            </svg>
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
