import { DeepPartial, EntityId, ID, VendureEntity } from '@vendure/core';
import { Column, Entity, ManyToOne, OneToMany } from 'typeorm';
import { Role } from '@vendure/core';
import { Tenant } from './tenant.entity';

@Entity()
export class Company extends VendureEntity {
    constructor(input?: DeepPartial<Company>) {
        super(input);
    }

    @Column({ nullable: false })
    code: string;

    @Column({ nullable: false })
    name: string;

    @Column({ default: true })
    enabled: boolean;

    @ManyToOne(() => Role)
    parentRole: Role;

    @EntityId()
    parentRoleId: ID;

    @OneToMany(() => Tenant, t => t.company)
    tenants: Tenant[];
}
