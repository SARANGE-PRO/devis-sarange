'use client';

import { useEffect, useState } from 'react';
import usePdfProgress from './usePdfProgress';
import styles from './QuoteSummary.module.css';

/**
 * Loader plein écran « volet roulant » SARANGE, réutilisé partout où une opération
 * longue est en cours (génération PDF d'un devis, signature…). On peut faire défiler
 * une liste de messages rassurants : ils tournent automatiquement.
 *
 * Pictogramme (120 × 120 px, repère commun au SVG et aux couches HTML) :
 *   - les parties FIXES (coffre, dormant, coulisses, vitrage, croisillons, ombre)
 *     sont un SVG statique, net à toutes les densités d'écran ;
 *   - le tablier, seule partie mobile, est une couche HTML découpée par un
 *     conteneur `overflow: hidden` calé sur l'ouverture, animée par un `transform`
 *     en px sur sa propre couche : la seule forme d'animation que le navigateur
 *     exécute sur le GPU, indépendamment du fil principal (occupé par la
 *     génération du PDF). Aucune valeur en pourcentage dans les keyframes :
 *     Chrome refuse de composer une animation dont la valeur dépend de la taille
 *     de la boîte.
 *
 * Barre de progression : suit l'avancement réel publié par lib/pdf-generator.js
 * tant qu'un PDF se construit ; sinon (envoi, signature côté serveur) elle
 * devient indéterminée.
 */

// Géométrie du tablier (px) : 8 lames de 9 px + lame finale de 9 px = 81 px,
// soit exactement la hauteur de l'ouverture (y 31 → 112). Les 9 px suivants
// portent l'ombre que le tablier projette sur le vitrage sous la lame finale.
const SLAT_HEIGHT = 9;
const SLAT_COUNT = 8;
const SLATS = Array.from({ length: SLAT_COUNT }, (_, index) => index * SLAT_HEIGHT);
const LAME_Y = SLAT_COUNT * SLAT_HEIGHT;
// Lettrage du logo : Inter 900, chargée par next/font sous la variable
// --font-inter posée sur <html> (app/layout.js), avec repli système.
const LOGO_FONT = { fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif' };

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
            <svg
              className={styles.iconSvg}
              viewBox="0 0 120 120"
              width="120"
              height="120"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <linearGradient id="pdfloader-glass" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#d6e6fa" />
                  <stop offset="0.55" stopColor="#f5f9ff" />
                  <stop offset="1" stopColor="#dfe9f5" />
                </linearGradient>
                <linearGradient id="pdfloader-frame" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#2c2c2c" />
                  <stop offset="1" stopColor="#141414" />
                </linearGradient>
                <linearGradient id="pdfloader-box" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#333333" />
                  <stop offset="1" stopColor="#171717" />
                </linearGradient>
                <filter id="pdfloader-blur" x="-20%" y="-50%" width="140%" height="200%">
                  <feGaussianBlur stdDeviation="3.5" />
                </filter>
              </defs>

              {/* Ombre portée au sol */}
              <ellipse cx="60" cy="115" rx="46" ry="4.5" fill="#0f172a" opacity="0.18" filter="url(#pdfloader-blur)" />

              {/* Dormant */}
              <rect x="12" y="30" width="96" height="82" rx="5" fill="url(#pdfloader-frame)" />
              <rect x="12.5" y="30.5" width="95" height="81" rx="4.5" fill="none" stroke="#ffffff" strokeOpacity="0.07" />

              {/* Vitrage et reflets */}
              <rect x="17" y="35" width="86" height="72" rx="1.5" fill="url(#pdfloader-glass)" />
              <path d="M17 62 L44 35 H56 L17 74 Z" fill="#ffffff" opacity="0.6" />
              <path d="M64 107 L103 68 V76 L72 107 Z" fill="#ffffff" opacity="0.4" />

              {/* Croisillons */}
              <rect x="58" y="35" width="4" height="72" fill="#1a1a1a" />
              <rect x="17" y="69" width="86" height="4" fill="#1a1a1a" />

              {/* Coulisses latérales, dans lesquelles le tablier descend */}
              <rect x="12" y="31" width="3" height="76" fill="#3d3d3d" />
              <rect x="105" y="31" width="3" height="76" fill="#3d3d3d" />

              {/* Coffre, légèrement plus large que le dormant */}
              <rect x="8" y="10" width="104" height="21" rx="5" fill="url(#pdfloader-box)" />
              <rect x="8" y="26" width="104" height="5" fill="#141414" />
              <rect x="16" y="15" width="88" height="1.5" rx="0.75" fill="#ffffff" opacity="0.12" />
            </svg>

            {/* Tablier : découpé sur l'ouverture (x 15 → 105, y 31 → 112) */}
            <div className={styles.shutterClip}>
              <div className={styles.shutter}>
                <svg viewBox="0 0 90 90" width="90" height="90" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="pdfloader-slat" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="#ff8049" />
                      <stop offset="0.55" stopColor="#ff5f1f" />
                      <stop offset="1" stopColor="#e9521a" />
                    </linearGradient>
                    <linearGradient id="pdfloader-drop" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="#0f172a" stopOpacity="0.28" />
                      <stop offset="1" stopColor="#0f172a" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {SLATS.map((y) => (
                    <g key={y}>
                      <rect x="0" y={y} width="90" height={SLAT_HEIGHT} fill="url(#pdfloader-slat)" />
                      <rect x="0" y={y} width="90" height="1" fill="#ffffff" opacity="0.25" />
                      <rect x="0" y={y + SLAT_HEIGHT - 1} width="90" height="1" fill="#000000" opacity="0.22" />
                    </g>
                  ))}
                  {/* Lettrage du logo (public/logo.svg) centré sur les lames, légèrement embossé */}
                  <text
                    x="45"
                    y="40.8"
                    textAnchor="middle"
                    style={LOGO_FONT}
                    fontWeight="900"
                    fontSize="11"
                    letterSpacing="-0.05em"
                    fill="#000000"
                    opacity="0.2"
                  >
                    SARANGE.
                  </text>
                  <text
                    x="45"
                    y="40"
                    textAnchor="middle"
                    style={LOGO_FONT}
                    fontWeight="900"
                    fontSize="11"
                    letterSpacing="-0.05em"
                    fill="#ffffff"
                  >
                    SARANGE<tspan fill="#1a1a1a">.</tspan>
                  </text>
                  <rect x="0" y={LAME_Y} width="90" height="9" fill="#1a1a1a" />
                  <rect x="0" y={LAME_Y + 6.5} width="90" height="1.5" fill="#94a3b8" opacity="0.55" />
                  <rect x="0" y={LAME_Y + 9} width="90" height="9" fill="url(#pdfloader-drop)" />
                </svg>
              </div>
            </div>
          </div>

          <div className={styles.loaderText}>
            <p className={styles.title}>{title}</p>
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
