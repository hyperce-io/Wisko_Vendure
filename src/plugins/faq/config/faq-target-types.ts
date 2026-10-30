import { Injector, RequestContext } from '@vendure/core';

/**
 * Definition of a FAQ assignment target type. Register one per kind of "thing"
 * an FAQ can be attached to (Product, static Page, and in the future
 * Collection, BlogPost, etc.).
 *
 * The `code` is stored in `faq_assignment.target_type`. It is a lowercased
 * string in the database but exposed as an uppercased GraphQL enum value at
 * runtime (see `buildFaqTargetTypeEnumSdl` in `../api/build-schema.ts`).
 */
export interface FaqTargetTypeDefinition {
    /** DB / API discriminator, e.g. `'product'`, `'page'`. Must be unique. */
    code: string;

    /** Human-readable label for admin UI. */
    label: string;

    /**
     * Validate a `targetKey` for this target type. Called on create/update to
     * reject unknown ids or unregistered page keys. Return `true` if valid.
     */
    validate(ctx: RequestContext, injector: Injector, targetKey: string): Promise<boolean>;

    /**
     * Optional display resolver for admin UI (e.g. show a product's name in
     * the assignments list instead of just its id). Not used at runtime by the
     * shop API.
     */
    resolveDisplay?(
        ctx: RequestContext,
        injector: Injector,
        targetKey: string,
    ): Promise<{ label: string; url?: string } | null>;
}

/**
 * In-memory registry populated by `FaqPlugin.init`. Kept as a plain object so
 * it can be read by services, resolvers, and the SDL builder without going
 * through Nest DI (needed at bootstrap time before the injector is ready).
 */
class FaqTargetTypeRegistry {
    private definitions = new Map<string, FaqTargetTypeDefinition>();

    register(definition: FaqTargetTypeDefinition): void {
        if (this.definitions.has(definition.code)) {
            throw new Error(`FAQ target type '${definition.code}' is already registered`);
        }
        this.definitions.set(definition.code, definition);
    }

    get(code: string): FaqTargetTypeDefinition | undefined {
        return this.definitions.get(code);
    }

    has(code: string): boolean {
        return this.definitions.has(code);
    }

    all(): FaqTargetTypeDefinition[] {
        return Array.from(this.definitions.values());
    }

    codes(): string[] {
        return Array.from(this.definitions.keys());
    }

    reset(): void {
        this.definitions.clear();
    }
}

export const faqTargetTypeRegistry = new FaqTargetTypeRegistry();

/** Convert a registry `code` (`'product'`) into its GraphQL enum value (`'PRODUCT'`). */
export function targetCodeToEnum(code: string): string {
    return code.toUpperCase().replace(/-/g, '_');
}

/** Reverse of `targetCodeToEnum`. */
export function enumToTargetCode(enumValue: string): string {
    return enumValue.toLowerCase().replace(/_/g, '-');
}

/**
 * Robustly resolve any incoming target-type value (registry code, enum value,
 * or mixed-case variant) to the canonical registry code. Returns `undefined`
 * when the value doesn't map to any registered target type.
 */
export function resolveTargetCode(value: string): string | undefined {
    if (!value) return undefined;
    if (faqTargetTypeRegistry.has(value)) return value;
    const lower = value.toLowerCase();
    if (faqTargetTypeRegistry.has(lower)) return lower;
    const fromEnum = enumToTargetCode(value);
    if (faqTargetTypeRegistry.has(fromEnum)) return fromEnum;
    return undefined;
}
