import { FaqTargetTypeDefinition } from '../faq-target-types';

export const PAGE_TARGET_CODE = 'page';

/**
 * Attach FAQs to a symbolic storefront page such as `home`, `about`, `contact`.
 *
 * `targetKey` is the page key (a plain string). Valid keys are configured via
 * `FaqPlugin.init({ pageKeys: [...] })`. If nothing is configured, the default
 * from `../faq-pages.ts` is used.
 *
 * Because pages are validated against an in-memory list of allowed keys, adding
 * or removing a page requires no database migration.
 */
export function makePageFaqTarget(getAllowedPageKeys: () => readonly string[]): FaqTargetTypeDefinition {
    return {
        code: PAGE_TARGET_CODE,
        label: 'Page',
        async validate(_ctx, _injector, targetKey) {
            return getAllowedPageKeys().includes(targetKey);
        },
        async resolveDisplay(_ctx, _injector, targetKey) {
            return { label: targetKey };
        },
    };
}
