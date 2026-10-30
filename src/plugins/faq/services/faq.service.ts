import { Inject, Injectable } from '@nestjs/common';
import { In, IsNull } from 'typeorm';
import {
    assertFound,
    ChannelService,
    ID,
    Injector,
    ListQueryBuilder,
    ProductService,
    RequestContext,
    TransactionalConnection,
    TranslatableSaver,
    TranslatorService,
    UserInputError,
} from '@vendure/core';
import { ModuleRef } from '@nestjs/core';

import { Faq } from '../entities/faq.entity';
import { FaqAssignment } from '../entities/faq-assignment.entity';
import { FaqTranslation } from '../entities/faq-translation.entity';
import { enumToTargetCode, faqTargetTypeRegistry, resolveTargetCode } from '../config/faq-target-types';
import { COLLECTION_TARGET_CODE } from '../config/targets/collection.target';
import { PRODUCT_TARGET_CODE } from '../config/targets/product.target';
import { FAQ_PLUGIN_OPTIONS } from '../constants';
import { PluginInitOptions } from '../types';

import {
    CreateFaqInput,
    DeletionResponse,
    DeletionResult,
    FaqAssignmentInput,
    FaqListOptions,
    UpdateFaqInput,
} from '../../../codegen/adminTypes';

interface AssignmentInputInternal {
    targetType: string; // registry code (already normalized from enum → code)
    targetKey: string;
    position?: number | null;
    enabled?: boolean | null;
}

@Injectable()
export class FaqService {
    constructor(
        private connection: TransactionalConnection,
        private listQueryBuilder: ListQueryBuilder,
        private translator: TranslatorService,
        private translatableSaver: TranslatableSaver,
        private channelService: ChannelService,
        private moduleRef: ModuleRef,
        @Inject(FAQ_PLUGIN_OPTIONS) private options: PluginInitOptions,
    ) {}

    // ---------- Reads ----------

    /**
     * Unified list query. When `target` + `id` are provided, returns FAQs
     * assigned to that target (ordered by per-assignment `position`). Otherwise
     * returns the paginated global list.
     */
    async findAll(
        ctx: RequestContext,
        options?: FaqListOptions,
        target?: { targetType: string; targetKey: string; enabledOnly: boolean },
    ) {
        if (target) {
            return this.findForTarget(ctx, target.targetType, target.targetKey, target.enabledOnly);
        }
        return this.listQueryBuilder
            .build(Faq, options, {
                ctx,
                channelId: ctx.channelId,
                where: { deletedAt: IsNull() },
            })
            .getManyAndCount()
            .then(([faqs, totalItems]) => ({
                items: faqs.map(faq => this.translator.translate(faq, ctx)),
                totalItems,
            }));
    }

    async findOne(ctx: RequestContext, id: ID) {
        return this.connection
            .findOneInChannel(ctx, Faq, id, ctx.channelId, {
                where: { deletedAt: IsNull() },
            })
            .then(faq => (faq ? this.translator.translate(faq, ctx) : undefined));
    }

    /**
     * Fetch FAQs assigned to a given target. Ordered by `FaqAssignment.position`.
     *
     * @param enabledOnly When true, filters out disabled FAQs and disabled
     *   assignments (used by the shop API).
     */
    async findForTarget(ctx: RequestContext, targetType: string, targetKey: string, enabledOnly: boolean) {
        const qb = this.connection
            .getRepository(ctx, Faq)
            .createQueryBuilder('faq')
            // The `assignment` alias below is used ONLY for filtering (target
            // + channel scoping). To populate the eager-declared relations on
            // the returned entities, we need explicit `leftJoinAndSelect`
            // calls with distinct aliases — TypeORM's `eager: true` is only
            // honored by `find*` methods, NOT by raw QueryBuilder.
            .leftJoinAndSelect('faq.translations', 'translation')
            .leftJoinAndSelect('faq.assignments', 'assignmentAll')
            .innerJoin('faq.assignments', 'assignment')
            .leftJoin('faq.channels', 'channel')
            .where('assignment.targetType = :targetType', { targetType })
            .andWhere('assignment.targetKey = :targetKey', { targetKey })
            .andWhere('channel.id = :channelId', { channelId: ctx.channelId })
            .andWhere('faq.deletedAt IS NULL')
            .orderBy('assignment.position', 'ASC')
            .addOrderBy('assignment.createdAt', 'ASC');

        if (enabledOnly) {
            qb.andWhere('faq.enabled = :faqEnabled', { faqEnabled: true }).andWhere(
                'assignment.enabled = :aEnabled',
                { aEnabled: true },
            );
        }

        const faqs = await qb.getMany();
        const items = faqs.map(faq => this.translator.translate(faq, ctx));
        return { items, totalItems: items.length };
    }

    /** Convenience: FAQs for a product (uses `findForTarget` under the hood). */
    findForProduct(ctx: RequestContext, productId: ID, enabledOnly: boolean) {
        return this.findForTarget(ctx, PRODUCT_TARGET_CODE, String(productId), enabledOnly);
    }

    /** Convenience: FAQs for a collection (uses `findForTarget` under the hood). */
    findForCollection(ctx: RequestContext, collectionId: ID, enabledOnly: boolean) {
        return this.findForTarget(ctx, COLLECTION_TARGET_CODE, String(collectionId), enabledOnly);
    }

    async getAssignmentsForFaq(ctx: RequestContext, faqId: ID): Promise<FaqAssignment[]> {
        return this.connection.getRepository(ctx, FaqAssignment).find({
            where: { faq: { id: faqId } as any },
            order: { targetType: 'ASC', position: 'ASC' },
        });
    }

    // ---------- Writes ----------

    async create(ctx: RequestContext, input: CreateFaqInput) {
        const assignments = input.assignments;
        const faq = await this.translatableSaver.create({
            ctx,
            input,
            entityType: Faq,
            translationType: FaqTranslation,
            beforeSave: async f => {
                await this.channelService.assignToCurrentChannel(f, ctx);
            },
        });
        if (assignments && assignments.length > 0) {
            await this.replaceAssignments(ctx, faq.id, assignments);
        }
        return assertFound(this.findOne(ctx, faq.id));
    }

    async update(ctx: RequestContext, input: UpdateFaqInput) {
        const assignments = input.assignments;
        const hasAssignments = assignments !== undefined;
        const updated = await this.translatableSaver.update({
            ctx,
            input,
            entityType: Faq,
            translationType: FaqTranslation,
        });
        if (hasAssignments) {
            await this.replaceAssignments(ctx, updated.id, assignments ?? []);
        }
        return assertFound(this.findOne(ctx, updated.id));
    }

    async delete(ctx: RequestContext, ids: ID[]): Promise<DeletionResponse> {
        if (ids.length === 0) {
            throw new UserInputError('error.no-ids-provided');
        }
        const qb = this.connection.getRepository(ctx, Faq).createQueryBuilder('faq');
        const existingFaqIds = await qb
            .leftJoin('faq.channels', 'channel')
            .andWhere('faq.id IN (:...ids)', { ids })
            .andWhere('channel.id = :channelId', { channelId: ctx.channelId })
            .andWhere('faq.deletedAt IS NULL')
            .select('faq.id')
            .getMany()
            .then(faqs => faqs.map(faq => faq.id));

        const nonExistingIds = ids.filter(id => !existingFaqIds.includes(id));
        if (nonExistingIds.length > 0) {
            throw new UserInputError(
                `FAQ/s with ID/s ${nonExistingIds.join(', ')} not found or unavailable in this channel.`,
            );
        }

        const deleteResult = await this.connection.getRepository(ctx, Faq).softDelete({
            id: In(existingFaqIds),
        });
        if ((deleteResult.affected ?? 0) > 0) {
            return {
                message: `${deleteResult.affected} FAQ(s) deleted successfully.`,
                result: DeletionResult.DELETED,
            };
        }
        return { message: 'No FAQs were deleted.', result: DeletionResult.NOT_DELETED };
    }

    /**
     * Reorder all FAQs assigned to a target. Rejects the request if `faqIds`
     * doesn't cover exactly the set of FAQs currently assigned to the target
     * (prevents accidental orphaning).
     */
    async reorderAssignments(ctx: RequestContext, targetType: string, targetKey: string, faqIds: ID[]) {
        const repo = this.connection.getRepository(ctx, FaqAssignment);
        const current = await repo.find({
            where: { targetType, targetKey } as any,
            relations: ['faq'],
        });
        const currentFaqIds = new Set(current.map(a => String(a.faq.id)));
        const requestedFaqIds = new Set(faqIds.map(String));
        if (
            currentFaqIds.size !== requestedFaqIds.size ||
            [...currentFaqIds].some(id => !requestedFaqIds.has(id))
        ) {
            throw new UserInputError(
                `reorderFaqAssignments: faqIds must exactly match the FAQs currently assigned to this target`,
            );
        }
        // Persist new positions.
        await Promise.all(
            faqIds.map((faqId, index) => {
                const assignment = current.find(a => String(a.faq.id) === String(faqId));
                if (!assignment) return Promise.resolve();
                return repo.update(assignment.id, { position: index });
            }),
        );
        const result = await this.findForTarget(ctx, targetType, targetKey, false);
        return result.items;
    }

    /**
     * Add a single assignment to an FAQ. Idempotent: if the target already has
     * an assignment for this FAQ, we update `position`/`enabled` in place.
     */
    async addAssignment(ctx: RequestContext, faqId: ID, input: FaqAssignmentInput) {
        const code = resolveTargetCode(input.targetType);
        if (!code) {
            throw new UserInputError(`Unknown FAQ target type '${input.targetType}'`);
        }
        const def = faqTargetTypeRegistry.get(code)!;
        const injector = new Injector(this.moduleRef);
        if (!(await def.validate(ctx, injector, input.targetKey))) {
            throw new UserInputError(`Invalid targetKey '${input.targetKey}' for target type '${code}'`);
        }
        const repo = this.connection.getRepository(ctx, FaqAssignment);
        const existing = await repo.findOne({
            where: { faq: { id: faqId } as any, targetType: code, targetKey: input.targetKey },
        });
        if (existing) {
            await repo.update(existing.id, {
                position: input.position ?? existing.position,
                enabled: input.enabled ?? existing.enabled,
            });
        } else {
            // Position defaults to end-of-list for this target.
            const currentCount = await repo.count({
                where: { targetType: code, targetKey: input.targetKey } as any,
            });
            await repo.save(
                repo.create({
                    faq: { id: faqId } as any,
                    targetType: code,
                    targetKey: input.targetKey,
                    position: input.position ?? currentCount,
                    enabled: input.enabled ?? true,
                }),
            );
        }
        return assertFound(this.findOne(ctx, faqId));
    }

    /**
     * Remove a single assignment by target coordinates. No-op if no match.
     */
    async removeAssignment(ctx: RequestContext, faqId: ID, targetType: string, targetKey: string) {
        const code = resolveTargetCode(targetType) ?? enumToTargetCode(targetType);
        const repo = this.connection.getRepository(ctx, FaqAssignment);
        await repo.delete({
            faq: { id: faqId } as any,
            targetType: code,
            targetKey,
        });
        return assertFound(this.findOne(ctx, faqId));
    }

    // ---------- Private ----------

    /**
     * Full-replacement semantics: delete all existing assignments for the FAQ
     * and insert the new set. Each incoming assignment is validated via the
     * registered target-type definition.
     */
    private async replaceAssignments(
        ctx: RequestContext,
        faqId: ID,
        assignments: AssignmentInputInternal[],
    ): Promise<void> {
        // Validate every input first (fail fast, before any DB writes).
        const injector = new Injector(this.moduleRef);
        const normalized: AssignmentInputInternal[] = [];
        for (const raw of assignments) {
            // Accept either the registry code (`'product'`) or the GraphQL
            // enum value (`'PRODUCT'`) or any case variant thereof.
            const code = resolveTargetCode(raw.targetType);
            if (!code) {
                throw new UserInputError(`Unknown FAQ target type '${raw.targetType}'`);
            }
            const def = faqTargetTypeRegistry.get(code)!;
            const ok = await def.validate(ctx, injector, raw.targetKey);
            if (!ok) {
                throw new UserInputError(`Invalid targetKey '${raw.targetKey}' for target type '${code}'`);
            }
            normalized.push({ ...raw, targetType: code });
        }

        const repo = this.connection.getRepository(ctx, FaqAssignment);
        await repo.delete({ faq: { id: faqId } as any });
        if (normalized.length === 0) return;

        const rows = normalized.map((a, idx) =>
            repo.create({
                faq: { id: faqId } as any,
                targetType: a.targetType,
                targetKey: a.targetKey,
                position: typeof a.position === 'number' ? a.position : idx,
                enabled: a.enabled ?? true,
            }),
        );
        await repo.save(rows);
    }
}
