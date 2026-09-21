// Doublure de jspdf pour les tests de schémas : aucun PDF n'est produit.
export class jsPDF {
  constructor() {
    this.internal = { pageSize: { getWidth: () => 210, getHeight: () => 297 } };
  }
}

export default jsPDF;
