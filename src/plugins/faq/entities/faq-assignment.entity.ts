import { Column, Entity, Index, ManyToOne, Unique } from 'typeorm';
import { DeepPartial, VendureEntity } from '@vendure/core';
import { Faq } from './faq.entity';

/**
 * Polymorphic assignment of a FAQ to a target (a Product, a static page, or a future
 * entity type). The target is identified by a `targetType` discriminator + a `targetKey`
 * that holds either an entity id (as string) or a symbolic key such as `'home'`.
 *
 * Each row also has its own `position` (per-target ordering) and `enabled` flag so an
 * admin can temporarily hide an FAQ on a single target without deleting it.
 */
@Entity()
@Unique('UQ_faq_assignment_faq_target', ['faq', 'targetType', 'targetKey'])
@Index('IDX_faq_assignment_target_lookup', ['targetType', 'targetKey', 'enabled'])
export class FaqAssignment extends VendureEntity {
    constructor(input?: DeepPartial<FaqAssignment>) {
        super(input);
    }

    @Index()
    @ManyToOne(() => Faq, faq => faq.assignments, { onDelete: 'CASCADE' })
    faq: Faq;

    /**
     * Registered target-type code, e.g. `'product'` or `'page'`. Open string so
     * additional target types can be introduced by adding a new registry entry
     * (no database migration required).
     */
    @Column('varchar')
    targetType: string;

    /**
     * For entity-backed targets this is the target entity id as a string
     * (e.g. `'42'`). For symbolic targets (like pages) this is the page key
     * (e.g. `'home'`).
     */
    @Column('varchar')
    targetKey: string;

    @Column('int', { default: 0 })
    position: number;

    @Column('boolean', { default: true })
    enabled: boolean;
}
