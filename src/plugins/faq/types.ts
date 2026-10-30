import { FaqTargetTypeDefinition } from './config/faq-target-types';

/**
 * Options accepted by `FaqPlugin.init()`.
 */
export interface PluginInitOptions {
    /**
     * List of storefront page keys the plugin recognizes as valid `target: PAGE`
     * assignment targets. Defaults to `DEFAULT_FAQ_PAGE_KEYS` (currently just
     * `'home'`).
     *
     * Adding a new key here requires only a plugin re-init — no database
     * migration.
     */
    pageKeys?: readonly string[];

    /**
     * Additional target types to register alongside the built-in `product` and
     * `page` targets. Use this to attach FAQs to future entity types
     * (Collection, BlogPost, …) without touching the plugin source.
     */
    additionalTargetTypes?: FaqTargetTypeDefinition[];
}
