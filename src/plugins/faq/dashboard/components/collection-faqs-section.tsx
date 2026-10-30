import { TargetFaqsSection } from './target-faqs-section';

export function CollectionFaqsSection({ context }: { context: any }) {
  const collectionId = context.entity?.id;
  if (!collectionId) return null;

  return (
    <TargetFaqsSection
      targetType="COLLECTION"
      targetId={String(collectionId)}
      noun="collection"
      assignSearchKey="assignToCollection"
      blockId="collection-faqs-table"
    />
  );
}
