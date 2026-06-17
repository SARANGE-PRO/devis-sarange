// Icône « Texte seul » (hors catalogue) : un document texte non tarifé.
export default function TextOnlyIcon({ size = 32, className = '', ...props }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {/* Feuille avec coin replié */}
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      {/* Lignes de texte */}
      <path d="M8.5 12.5h7" />
      <path d="M8.5 15.5h7" />
      <path d="M8.5 18.5h4" />
    </svg>
  );
}
