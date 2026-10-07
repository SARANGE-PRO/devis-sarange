import DemandesPage from '@/components/DemandesPage';

/**
 * Demandes de devis reçues par e-mail, détectées par le scan de la boîte
 * contact@sarange.fr. Réservée aux administrateurs (vérifié côté serveur par
 * app/api/demandes/*) ; aucune entrée dans le menu principal, seulement une
 * icône discrète pour les administrateurs (sidebar desktop, topbar mobile).
 */
export default function Page() {
  return <DemandesPage />;
}
