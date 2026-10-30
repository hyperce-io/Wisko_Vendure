import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  api,
  Button,
  DataTableBulkActionItem,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  PageBlockContext,
  PaginatedListDataTable,
} from '@vendure/dashboard';
import { PlusIcon, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
  addFaqAssignmentMutation,
  getFaqPickerListQuery,
  getFaqsForTargetQuery,
  removeFaqAssignmentMutation,
  reorderFaqAssignmentsMutation,
} from '../faq.graphql';

import { faqCustomizeColumns, faqDefaultVisibility } from './faq-columns';

export interface TargetFaqsSectionProps {
  /** `FaqTargetType` enum value, e.g. `PRODUCT` or `COLLECTION`. */
  targetType: string;
  /** The id of the entity the FAQs are assigned to. */
  targetId: string;
  /** Lowercase noun used in copy and toasts, e.g. "product". */
  noun: string;
  /** Search param the "New FAQ" button uses to pre-seed the assignment. */
  assignSearchKey: string;
  blockId: string;
}

export function TargetFaqsSection({
  targetType,
  targetId,
  noun,
  assignSearchKey,
  blockId,
}: TargetFaqsSectionProps) {
  const queryClient = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);

  const invalidate = () => {
    void queryClient.invalidateQueries();
  };

  const { mutateAsync: addAssignment } = useMutation({
    mutationFn: (vars: { faqId: string }) =>
      api.mutate(addFaqAssignmentMutation, {
        faqId: vars.faqId,
        input: {
          targetType: targetType as any,
          targetKey: String(targetId),
          enabled: true,
        },
      }),
  });

  const { mutateAsync: removeAssignment } = useMutation({
    mutationFn: (vars: { faqId: string }) =>
      api.mutate(removeFaqAssignmentMutation, {
        faqId: vars.faqId,
        target: targetType as any,
        id: String(targetId),
      }),
  });

  const { mutateAsync: reorder } = useMutation({
    mutationFn: (input: any) => api.mutate(reorderFaqAssignmentsMutation, { input }),
  });

  const handleReorder = async (oldIndex: number, newIndex: number, _item: any) => {
    // The table's current items aren't available in this callback, so read the
    // latest faqs result out of the query cache instead.
    const cache = queryClient.getQueriesData<any>({ predicate: () => true });
    const relevant = cache.map(([, data]) => data).find(d => d && d.faqs && Array.isArray(d.faqs.items));
    const items: Array<{ id: string }> = relevant?.faqs?.items ?? [];
    if (items.length === 0) return;
    const ids = items.map(f => String(f.id));
    if (oldIndex < 0 || newIndex < 0 || oldIndex >= ids.length || newIndex >= ids.length) return;
    const [moved] = ids.splice(oldIndex, 1);
    ids.splice(newIndex, 0, moved);
    try {
      await reorder({ target: targetType, id: String(targetId), faqIds: ids });
      invalidate();
    } catch (err) {
      toast.error('Failed to reorder FAQs', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  };

  if (!targetId) return null;

  return (
    <PageBlockContext.Provider value={{ blockId, column: 'main' } as any}>
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground">
            FAQs that appear on this {noun}'s page. Drag rows to reorder, select rows to bulk-remove.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
            <PlusIcon className="mr-2 h-4 w-4" />
            Add existing FAQ
          </Button>
          <Button
            size="sm"
            render={<Link to="/faq/new" search={{ [assignSearchKey]: String(targetId) } as any} />}
          >
            <PlusIcon className="mr-2 h-4 w-4" />
            New FAQ
          </Button>
        </div>
      </div>

      <PaginatedListDataTable
        listQuery={getFaqsForTargetQuery as any}
        transformVariables={(vars: any) => ({
          ...vars,
          target: targetType,
          id: String(targetId),
        })}
        onReorder={handleReorder}
        bulkActions={[
          {
            order: 100,
            component: ({ selection, table }: any) => (
              <DataTableBulkActionItem
                onClick={async () => {
                  const ids = selection.map((s: any) => String(s.id));
                  try {
                    await Promise.all(ids.map((faqId: string) => removeAssignment({ faqId })));
                    toast.success(
                      ids.length === 1
                        ? `FAQ removed from ${noun}`
                        : `Removed ${ids.length} FAQ(s) from ${noun}`,
                    );
                    table.resetRowSelection();
                    invalidate();
                  } catch (err) {
                    toast.error('Failed to remove selected FAQs', {
                      description: err instanceof Error ? err.message : 'Unknown error',
                    });
                  }
                }}
                label={`Remove from ${noun}`}
                confirmationText={
                  selection.length === 1
                    ? `Remove this FAQ from the ${noun}? The FAQ itself will not be deleted.`
                    : `Remove ${selection.length} FAQ(s) from this ${noun}? The FAQs will not be deleted.`
                }
                icon={Trash2}
                className="text-destructive"
              />
            ),
          },
        ]}
        // NOTE: no `rowActions` — the framework auto-invokes each bulk action
        // with `selection: [row.original]` in the per-row dropdown as well, so a
        // `rowActions` entry would render as a visible duplicate.
        defaultVisibility={{
          ...faqDefaultVisibility,
          assignments: false,
          createdAt: false,
        }}
        defaultColumnOrder={['question', 'answer', 'enabled', 'updatedAt'] as any}
        // Absolute path: `./id` would resolve relative to the current detail route.
        customizeColumns={faqCustomizeColumns(id => `/faq/${id}`)}
        page={1}
        itemsPerPage={25}
        sorting={[]}
        onPageChange={() => {
          /* no-op — backend returns all matching FAQs (no pagination for target queries) */
        }}
        onSortChange={() => {
          /* no-op */
        }}
        onFilterChange={() => {
          /* no-op */
        }}
      />

      <AddFaqDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        targetType={targetType}
        targetId={String(targetId)}
        noun={noun}
        onAdded={() => invalidate()}
        addAssignment={addAssignment}
      />
    </PageBlockContext.Provider>
  );
}

function AddFaqDialog({
  open,
  onOpenChange,
  targetType,
  targetId,
  noun,
  onAdded,
  addAssignment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetType: string;
  targetId: string;
  noun: string;
  onAdded: () => void;
  addAssignment: (vars: { faqId: string }) => Promise<any>;
}) {
  const [search, setSearch] = useState('');

  const { data: assignedData } = useQuery({
    queryKey: ['faqsForTarget-picker-exclude', targetType, targetId],
    queryFn: () =>
      api.query(getFaqsForTargetQuery, {
        target: targetType as any,
        id: String(targetId),
      }),
    enabled: open,
  });
  const assignedIds = useMemo(
    () => new Set((assignedData?.faqs.items ?? []).map(f => String(f.id))),
    [assignedData],
  );

  const { data: pickerData, isLoading } = useQuery({
    queryKey: ['faqPickerList-dialog', search],
    queryFn: () =>
      api.query(getFaqPickerListQuery, {
        options: search ? { filter: { question: { contains: search } } } : undefined,
      }),
    enabled: open,
  });

  const availableToAdd = useMemo(() => {
    return (pickerData?.faqs.items ?? []).filter(f => !assignedIds.has(String(f.id)));
  }, [pickerData, assignedIds]);

  const handleAdd = async (faqId: string) => {
    try {
      await addAssignment({ faqId });
      toast.success(`FAQ assigned to ${noun}`);
      onAdded();
    } catch (err) {
      toast.error('Failed to assign FAQ', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add FAQ to {noun}</DialogTitle>
          <DialogDescription>
            Select an existing FAQ to assign to this {noun}. FAQs already assigned are hidden.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Input
            placeholder="Search FAQs…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
          {isLoading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Loading…</div>
          ) : availableToAdd.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {search ? 'No matching FAQs.' : 'No FAQs available to add.'}
            </div>
          ) : (
            <ul className="flex max-h-72 flex-col gap-1 overflow-auto rounded-md border border-input p-1">
              {availableToAdd.map(faq => (
                <li key={faq.id}>
                  <button
                    type="button"
                    onClick={() => handleAdd(String(faq.id))}
                    className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
                  >
                    <span className="truncate pr-2">{faq.question ?? '(untitled)'}</span>
                    <PlusIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
