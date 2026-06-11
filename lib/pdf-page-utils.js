export const getPdfCurrentPageNumber = (doc) => {
  const pageNumber = Number(
    doc?.internal?.getCurrentPageInfo?.()?.pageNumber || doc?.getNumberOfPages?.() || 1
  );

  return Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : 1;
};

export const renderOnPdfPage = (doc, pageNumber, render) => {
  if (!doc || typeof render !== 'function') {
    return undefined;
  }

  const currentPage = getPdfCurrentPageNumber(doc);
  const targetPage =
    Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : currentPage;

  if (typeof doc.setPage === 'function' && targetPage !== currentPage) {
    doc.setPage(targetPage);
  }

  try {
    return render(doc);
  } finally {
    if (typeof doc.setPage === 'function' && targetPage !== currentPage) {
      doc.setPage(currentPage);
    }
  }
};

export const collectQuoteImageSources = (cartItems = []) =>
  Array.from(
    new Set(
      cartItems
        .map((item) =>
          typeof item?.customImage === 'string' ? item.customImage.trim() : ''
        )
        .filter(Boolean)
    )
  );
