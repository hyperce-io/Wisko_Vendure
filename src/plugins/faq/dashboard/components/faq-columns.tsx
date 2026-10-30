import { DetailPageButton } from '@vendure/dashboard';

/**
 * Shared FAQ table column customizations used by:
 * - the standalone FAQ list page (`src/plugins/faq/dashboard/faq-list.tsx`)
 * - the Product-detail FAQ section (`./product-faqs-section.tsx`)
 *
 * The two pages need slightly different link targets (relative vs absolute)
 * so the `question` cell delegates to a caller-supplied `hrefFor(faqId)`.
 */

/**
 * Strip HTML tags from a rich-text answer and truncate for table display.
 * Falls back to `''` when the answer is null/undefined.
 */
function stripAndTruncate(html: string | null | undefined, max = 80): string {
  const raw = html || '';
  if (!raw) return '';
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = raw;
  const text = tempDiv.textContent || tempDiv.innerText || '';
  return text.length > max ? text.substring(0, max) + '…' : text;
}

/**
 * @param hrefFor - Build the URL to navigate to when the question cell is clicked.
 *   List page: `(id) => './' + id` (relative to `/faq`).
 *   Product page: `(id) => '/faq/' + id` (absolute, since `./` would resolve
 *   relative to `/products/$productId`).
 */
export function faqCustomizeColumns(hrefFor: (id: string) => string) {
  return {
    question: {
      header: 'Question',
      cell: ({ row }: any) => {
        const faq = row.original;
        return <DetailPageButton href={hrefFor(String(faq.id))} label={faq.question || '(untitled)'} />;
      },
    },
    answer: {
      header: 'Answer',
      cell: ({ row }: any) => {
        const truncated = stripAndTruncate(row.original.answer as string | null);
        return <span className="text-sm text-muted-foreground">{truncated}</span>;
      },
    },
    enabled: {
      header: 'Status',
      enableSorting: false,
      cell: ({ row }: any) => {
        const on = !!row.original.enabled;
        return (
          <span
            className={
              'inline-flex rounded-full px-2 py-0.5 text-xs font-medium ' +
              (on ? 'bg-emerald-500/10 text-emerald-700' : 'bg-muted text-muted-foreground')
            }
          >
            {on ? 'Enabled' : 'Disabled'}
          </span>
        );
      },
    },
    updatedAt: {
      header: 'Updated',
      cell: ({ row }: any) => {
        const d = new Date(row.original.updatedAt);
        return (
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {d.toLocaleDateString()} {d.toLocaleTimeString()}
          </span>
        );
      },
    },
  } as any;
}

/**
 * Default column visibility shared by both FAQ tables. Hides internal / raw
 * fields (`id`, `languageCode`, `translations`) from the default view.
 * Individual tables can spread this and add their own overrides
 * (e.g. `assignments: false` on the product-detail table).
 */
export const faqDefaultVisibility = {
  id: false,
  languageCode: false,
  translations: false,
};
