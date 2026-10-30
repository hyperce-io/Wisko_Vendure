import { useMutation } from '@tanstack/react-query';
import { api, BulkActionComponent, DataTableBulkActionItem, usePaginatedList } from '@vendure/dashboard';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { deleteFaqMutation } from '../faq.graphql';

export const DeleteFaqBulkAction: BulkActionComponent<any> = ({ selection, table }) => {
  const { refetchPaginatedList } = usePaginatedList();
  const { mutateAsync: deleteFaq } = useMutation({
    mutationFn: (ids: string[]) => {
      return api.mutate(deleteFaqMutation, { ids });
    },
  });

  const handleDelete = async () => {
    try {
      const result = await deleteFaq(selection.map(item => item.id));

      if (result.deleteFaq.result === 'DELETED') {
        toast.success(result.deleteFaq.message);
        refetchPaginatedList();
        table.resetRowSelection();
      } else {
        toast.error('Failed to delete FAQs');
      }
    } catch (error) {
      toast.error('Error deleting FAQs', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  return (
    <DataTableBulkActionItem
      onClick={handleDelete}
      label="Delete"
      confirmationText={`Are you sure you want to delete ${selection.length} FAQ(s)?`}
      icon={Trash2}
      className="text-destructive"
      requiresPermission={['DeleteFaq']}
    />
  );
};
