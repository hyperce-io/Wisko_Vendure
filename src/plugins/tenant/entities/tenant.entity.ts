import { DeepPartial, EntityId, ID, VendureEntity } from '@vendure/core';
import { Column, Entity, ManyToOne } from 'typeorm';
import { Role } from '@vendure/core';

@Entity()
export class Tenant extends VendureEntity {
    constructor(input?: DeepPartial<Tenant>) {
        super(input);
    }

    @Column({ nullable: false })
    code: string;

    @Column({ nullable: false })
    name: string;

    @Column({ default: true })
    enabled: boolean;

    @Column({ default: 5 })
    maxChannels: number;

    @ManyToOne(() => Role)
    parentRole: Role;

    @EntityId()
    parentRoleId: ID;
}
