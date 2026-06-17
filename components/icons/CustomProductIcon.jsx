// Icône « Produit / Service » (hors catalogue) : un colis/produit sur-mesure.
export default function CustomProductIcon({ size = 32, className = '', ...props }) {
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
      {/* Boîte / colis sur-mesure */}
      <path d="M12 2.8 20.2 7v10L12 21.2 3.8 17V7z" />
      <path d="M3.8 7 12 11.2 20.2 7" />
      <path d="M12 11.2v10" />
      {/* Étiquette « service » */}
      <path d="M7.6 9.1 16 4.4" opacity="0.55" />
    </svg>
  );
}
