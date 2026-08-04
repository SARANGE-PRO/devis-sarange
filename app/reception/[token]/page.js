import CompletionSignaturePage from '@/components/CompletionSignaturePage';

export default async function ReceptionPage({ params }) {
  const { token } = await params;
  return <CompletionSignaturePage token={token} />;
}
