import { TargetFaqsSection } from './target-faqs-section';

export function ProductFaqsSection({ context }: { context: any }) {
  const productId = context.entity?.id;
  if (!productId) return null;

  return (
    <TargetFaqsSection
      targetType="PRODUCT"
      targetId={String(productId)}
      noun="product"
      assignSearchKey="assignToProduct"
      blockId="faqs-table"
    />
  );
}
