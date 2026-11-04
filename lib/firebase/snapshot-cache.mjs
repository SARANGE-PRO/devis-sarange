/**
 * Sérialisation INCRÉMENTALE d'un abonnement Firestore (onSnapshot).
 *
 * Sans elle, chaque mise à jour d'un seul document re-sérialisait TOUS les
 * documents de la requête (normalisation du payload comprise) : sur une base de
 * plusieurs centaines de devis, chaque sauvegarde, chaque changement de statut
 * de signature coûtait un passage complet. Ici seuls les documents ajoutés,
 * modifiés ou supprimés (snapshot.docChanges) sont re-sérialisés ; les autres
 * sont repris du cache mémoire. L'ordre renvoyé reste celui de la requête.
 *
 * Un document illisible (payload corrompu, ancien schéma inattendu) est ignoré
 * et signalé via `onDocumentError` au lieu de faire échouer toute la liste.
 *
 * Module pur (aucun import) : testable avec de faux instantanés.
 */
export const createIncrementalSerializer = (serialize, { onDocumentError } = {}) => {
  const cache = new Map();

  return (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      const id = change.doc.id;
      if (change.type === 'removed') {
        cache.delete(id);
        return;
      }
      try {
        const item = serialize(change.doc);
        if (item) cache.set(id, item);
        else cache.delete(id);
      } catch (error) {
        cache.delete(id);
        onDocumentError?.(error, id);
      }
    });

    const items = [];
    snapshot.docs.forEach((entry) => {
      const item = cache.get(entry.id);
      if (item) items.push(item);
    });
    return items;
  };
};

/** Métadonnées utiles au chargement : instantané issu du cache local ou du serveur. */
export const describeSnapshot = (snapshot) => ({
  fromCache: Boolean(snapshot?.metadata?.fromCache),
  hasPendingWrites: Boolean(snapshot?.metadata?.hasPendingWrites),
});
