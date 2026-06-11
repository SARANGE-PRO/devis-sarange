import QuoteSignaturePage from '@/components/QuoteSignaturePage';

export default async function SignaturePage({ params }) {
  const { token } = await params;
  return <QuoteSignaturePage token={token} />;
}
