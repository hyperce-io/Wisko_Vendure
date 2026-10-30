import { Asset, Customer, DeepPartial, Order, VendureEntity } from '@vendure/core';
import { Column, Entity, ManyToOne } from 'typeorm';

export enum ComplaintStatus {
    Open = 'OPEN',
    InProgress = 'IN_PROGRESS',
    Resolved = 'RESOLVED',
}

@Entity()
export class Complaint extends VendureEntity {
    constructor(input?: DeepPartial<Complaint>) {
        super(input);
    }

    @ManyToOne(() => Customer)
    customer: Customer;

    @ManyToOne(() => Order)
    order: Order;

    @Column('varchar')
    issueType: string;

    @Column('text')
    description: string;

    @ManyToOne(() => Asset, { nullable: true })
    image: Asset | null;

    @Column({ type: 'varchar', default: ComplaintStatus.Open })
    status: string;

    @Column('text', { nullable: true })
    adminNote: string;
}
