/**
 * Default list of storefront page keys the FAQ plugin recognizes. Extend this
 * per-project by passing `pageKeys` to `FaqPlugin.init({ pageKeys: [...] })`.
 *
 * NOTE: These are string literals stored in the `faq_assignment.target_key`
 * column when `target_type = 'page'`. They are NOT database rows — adding a
 * new key requires no migration, only a plugin re-init.
 */
export const DEFAULT_FAQ_PAGE_KEYS = ['home'] as const;

export type DefaultFaqPageKey = (typeof DEFAULT_FAQ_PAGE_KEYS)[number];
