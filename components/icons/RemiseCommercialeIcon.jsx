// Icône « Remise commerciale supplémentaire » : étiquette de prix avec
// symbole pourcentage (même dessin que REMISE_ICON_SVG côté PDF).
export default function RemiseCommercialeIcon({ size = 32, className = '', ...props }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {/* Étiquette de prix */}
      <path d="M12.6 2.6 21 11a2 2 0 0 1 0 2.8l-7.2 7.2a2 2 0 0 1-2.8 0L2.6 12.6A2 2 0 0 1 2 11.2V4a2 2 0 0 1 2-2h7.2a2 2 0 0 1 1.4.6z" />
      <circle cx="6.8" cy="6.8" r="1.1" />
      {/* Pourcentage */}
      <path d="m9.7 15.5 5.8-5.8" />
      <circle cx="10.6" cy="10.6" r="1.2" />
      <circle cx="14.6" cy="14.6" r="1.2" />
    </svg>
  );
}
