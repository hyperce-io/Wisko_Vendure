import { AnyRoute, useNavigate } from '@tanstack/react-router';
import {
  Button,
  DashboardRouteDefinition,
  detailPageRouteLoader,
  FormFieldWrapper,
  Input,
  Page,
  PageActionBar,
  PageActionBarRight,
  PageBlock,
  PageLayout,
  PageTitle,
  PermissionGuard,
  RelationSelector,
  RichTextInput,
  Switch,
  TranslatableFormFieldWrapper,
  createRelationSelectorConfig,
  useDetailPage,
  ActionBarItem,
} from '@vendure/dashboard';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

import {
  createFaqMutation,
  getCollectionsForFaqPickerQuery,
  getFaqDetailQuery,
  getProductsForFaqPickerQuery,
  updateFaqMutation,
} from './faq.graphql';

// v1: pages are hardcoded to match the plugin's default. Planned for v2: expose
// via a `serverConfig.faqPageKeys` query so the dashboard reflects
// `FaqPlugin.init({ pageKeys })` automatically.
const AVAILABLE_PAGE_KEYS = ['home'];

/** Shape of a single assignment kept in the form state. */
interface AssignmentValue {
  targetType: 'PRODUCT' | 'COLLECTION' | 'PAGE';
  targetKey: string;
  position: number;
  enabled: boolean;
}

export const faqDetail: DashboardRouteDefinition = {
  path: '/faq/$id',
  loader: detailPageRouteLoader({
    queryDocument: getFaqDetailQuery,
    breadcrumb: (isNew, entity) => [{ path: '/faq', label: 'FAQs' }, isNew ? 'New FAQ' : entity?.id],
  }),
  component: route => {
    return <FaqDetailPage route={route as AnyRoute} />;
  },
};

function FaqDetailPage({ route }: { route: AnyRoute }) {
  const params = route.useParams();
  const search = (route.useSearch?.() ?? {}) as {
    assignToProduct?: string | string[];
    assignToCollection?: string | string[];
    assignToPage?: string | string[];
  };
  const navigate = useNavigate();
  const creatingNewEntity = params.id === 'new';

  const productSelectorConfig = createRelationSelectorConfig({
    listQuery: getProductsForFaqPickerQuery,
    idKey: 'id',
    labelKey: 'name',
    multiple: true,
    placeholder: 'Search products…',
  });

  const collectionSelectorConfig = createRelationSelectorConfig({
    listQuery: getCollectionsForFaqPickerQuery,
    idKey: 'id',
    labelKey: 'name',
    multiple: true,
    placeholder: 'Search collections…',
  });

  // Remember which context (product / page) the "New FAQ" click came from so
  // the post-create toast can offer a "Back to …" link. Populated on first
  // render only (see effect below); read inside `onSuccess` via ref so we
  // never restart the mutation.
  const originContextRef = useRef<{
    productId?: string;
    collectionId?: string;
    pageKey?: string;
  } | null>(null);

  const { form, submitHandler, entity, isPending, resetForm } = useDetailPage({
    queryDocument: getFaqDetailQuery,
    createDocument: createFaqMutation,
    updateDocument: updateFaqMutation,
    setValuesForUpdate: entity => {
      const assignments: AssignmentValue[] = ((entity?.assignments ?? []) as any[]).map((a: any) => ({
        targetType: a.targetType,
        targetKey: a.targetKey,
        position: a.position,
        enabled: a.enabled,
      }));
      return {
        id: entity?.id ?? '',
        enabled: entity?.enabled ?? false,
        translations: entity.translations.map((translation: any) => ({
          id: translation.id,
          languageCode: translation.languageCode,
          question: translation.question,
          answer: translation.answer,
        })),
        // Assignments live directly on the form and flow through into the
        // mutation input unchanged. Sub-forms (Products, Pages) manipulate
        // filtered subsets of this array via `productIds` / `pageKeys` helpers.
        assignments,
      };
    },
    params: { id: params.id },
    onSuccess: async data => {
      const wasCreating = creatingNewEntity;
      const origin = originContextRef.current;

      if (wasCreating && origin?.productId) {
        toast.success('FAQ created and assigned to product', {
          action: {
            label: 'Back to product',
            onClick: () => {
              void navigate({ to: `/products/${origin.productId}` as any });
            },
          },
          // Sonner's default action button is neutral (black in light theme,
          // white on dark). Force the primary brand color so the CTA is
          // visually recognizable as a link/button.
          actionButtonStyle: {
            backgroundColor: 'hsl(var(--primary))',
            color: 'hsl(var(--primary-foreground))',
          },
        });
      } else {
        toast.success(wasCreating ? `Successfully created FAQ` : `Successfully updated FAQ`);
      }

      resetForm();
      if (wasCreating) {
        await navigate({ to: `../$id`, params: { id: data.id } as any });
      }
    },
    onError: err => {
      toast.error(creatingNewEntity ? `Failed to create FAQ` : `Failed to update FAQ`, {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    },
  });

  // Seed the "Appears on" section from query params when the admin clicked
  // "New FAQ" from a context page (Product detail today, storefront pages
  // in the future). Runs exactly once per mount via `seededRef`, so a later
  // form re-render can never clobber user edits.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    if (!creatingNewEntity) return;

    const productKeys = toArray(search.assignToProduct);
    const collectionKeys = toArray(search.assignToCollection);
    const pageKeysFromCtx = toArray(search.assignToPage);
    if (productKeys.length === 0 && collectionKeys.length === 0 && pageKeysFromCtx.length === 0) {
      return;
    }

    const seed: AssignmentValue[] = [
      ...productKeys.map((id, idx) => ({
        targetType: 'PRODUCT' as const,
        targetKey: String(id),
        position: idx,
        enabled: true,
      })),
      ...collectionKeys.map((id, idx) => ({
        targetType: 'COLLECTION' as const,
        targetKey: String(id),
        position: idx,
        enabled: true,
      })),
      ...pageKeysFromCtx.map((key, idx) => ({
        targetType: 'PAGE' as const,
        targetKey: key,
        position: idx,
        enabled: true,
      })),
    ];

    (form.setValue as any)('assignments', seed, { shouldDirty: false });

    // Remember the origin so `onSuccess` can offer a "Back to …" link.
    originContextRef.current = {
      productId: productKeys[0],
      collectionId: collectionKeys[0],
      pageKey: pageKeysFromCtx[0],
    };
    seededRef.current = true;
  }, [creatingNewEntity, search.assignToProduct, search.assignToCollection, search.assignToPage, form]);

  const assignments = ((form.watch as any)('assignments') as AssignmentValue[] | undefined) ?? [];
  const productIds = assignments.filter(a => a.targetType === 'PRODUCT').map(a => a.targetKey);
  const collectionIds = assignments.filter(a => a.targetType === 'COLLECTION').map(a => a.targetKey);
  const pageKeys = assignments.filter(a => a.targetType === 'PAGE').map(a => a.targetKey);

  const setProducts = (nextIds: string[]) => {
    const nonProduct = assignments.filter(a => a.targetType !== 'PRODUCT');
    const next: AssignmentValue[] = [
      ...nonProduct,
      ...nextIds.map((id, idx) => ({
        targetType: 'PRODUCT' as const,
        targetKey: String(id),
        position: idx,
        enabled: true,
      })),
    ];
    (form.setValue as any)('assignments', next, { shouldDirty: true, shouldValidate: true });
  };

  const setCollections = (nextIds: string[]) => {
    const nonCollection = assignments.filter(a => a.targetType !== 'COLLECTION');
    const next: AssignmentValue[] = [
      ...nonCollection,
      ...nextIds.map((id, idx) => ({
        targetType: 'COLLECTION' as const,
        targetKey: String(id),
        position: idx,
        enabled: true,
      })),
    ];
    (form.setValue as any)('assignments', next, { shouldDirty: true, shouldValidate: true });
  };

  const setPages = (nextKeys: string[]) => {
    const nonPage = assignments.filter(a => a.targetType !== 'PAGE');
    const next: AssignmentValue[] = [
      ...nonPage,
      ...nextKeys.map((key, idx) => ({
        targetType: 'PAGE' as const,
        targetKey: key,
        position: idx,
        enabled: true,
      })),
    ];
    (form.setValue as any)('assignments', next, { shouldDirty: true, shouldValidate: true });
  };

  return (
    <Page pageId="faq-list" form={form} submitHandler={submitHandler}>
      <PageTitle>{creatingNewEntity ? 'New FAQ' : (entity?.question ?? '')}</PageTitle>
      <PageActionBar>
        <PageActionBar>
          <ActionBarItem itemId="save-button" requiresPermission={['CreateFaq', 'UpdateFaq']}>
            <Button type="submit" disabled={!form.formState.isDirty || !form.formState.isValid || isPending}>
              {creatingNewEntity ? 'Create' : 'Update'}
            </Button>
          </ActionBarItem>
        </PageActionBar>
      </PageActionBar>
      <PageLayout>
        <PageBlock column="side" blockId="enabled-toggle">
          <FormFieldWrapper
            control={form.control}
            name="enabled"
            label="Enabled"
            description="When enabled, a FAQ is available in the shop"
            render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
          />
        </PageBlock>
        <PageBlock column="main" blockId="main-form">
          <div className="grid gap-6 items-start mb-6">
            <TranslatableFormFieldWrapper
              control={form.control}
              name="question"
              label="Question"
              render={({ field }) => <Input {...(field as any)} />}
            />

            <TranslatableFormFieldWrapper
              control={form.control}
              name="answer"
              label="Description"
              render={({ field }) => <RichTextInput {...field} />}
            />
          </div>
        </PageBlock>

        <PageBlock column="side" blockId="faq-appears-on" title="Appears on">
          <div className="grid gap-6">
            <div>
              <div className="mb-2 text-sm font-medium">Products</div>
              <div className="mb-2 text-xs text-muted-foreground">
                Show this FAQ on the selected product pages.
              </div>
              <RelationSelector
                value={productIds as any}
                onChange={setProducts as any}
                config={productSelectorConfig as any}
              />
            </div>
            <div>
              <div className="mb-2 text-sm font-medium">Collections</div>
              <div className="mb-2 text-xs text-muted-foreground">
                Show this FAQ on the selected collection pages.
              </div>
              <RelationSelector
                value={collectionIds as any}
                onChange={setCollections as any}
                config={collectionSelectorConfig as any}
              />
            </div>
            <div>
              <div className="mb-2 text-sm font-medium">Pages</div>
              <div className="mb-2 text-xs text-muted-foreground">
                Show this FAQ on the selected storefront pages.
              </div>
              <PageKeyPicker value={pageKeys} onChange={setPages} options={AVAILABLE_PAGE_KEYS} />
            </div>
          </div>
        </PageBlock>
      </PageLayout>
    </Page>
  );
}

/** Normalize query-string values that may arrive as a single string or an array. */
function toArray(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function PageKeyPicker({
  value,
  onChange,
  options,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  options: string[];
}) {
  const toggle = (key: string) => {
    onChange(value.includes(key) ? value.filter(k => k !== key) : [...value, key]);
  };
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(key => {
        const selected = value.includes(key);
        return (
          <button
            key={key}
            type="button"
            onClick={() => toggle(key)}
            className={
              'px-3 py-1 rounded-md border text-sm transition-colors ' +
              (selected
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-foreground border-input hover:bg-accent')
            }
          >
            {key}
          </button>
        );
      })}
    </div>
  );
}
