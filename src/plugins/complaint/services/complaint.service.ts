import { Injectable } from '@nestjs/common';
import {
    AssetService,
    Customer,
    CustomerService,
    ForbiddenError,
    ID,
    isGraphQlErrorResult,
    ListQueryBuilder,
    Order,
    PaginatedList,
    patchEntity,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { FindOptionsWhere } from 'typeorm';

import { ComplaintListOptions as AdminComplaintListOptions, UpdateComplaintInput } from '../../../codegen/adminTypes';
import { ComplaintListOptions as ShopComplaintListOptions, CreateComplaintInput } from '../../../codegen/shopTypes';
import { Complaint, ComplaintStatus } from '../entities/complaint.entity';

@Injectable()
export class ComplaintService {
    constructor(
        private connection: TransactionalConnection,
        private customerService: CustomerService,
        private assetService: AssetService,
        private listQueryBuilder: ListQueryBuilder,
    ) {}

    findAll(ctx: RequestContext, options?: AdminComplaintListOptions): Promise<PaginatedList<Complaint>> {
        return this.listQueryBuilder
            .build(Complaint, options, {
                relations: ['order', 'customer', 'image'],
                where: this.inActiveChannel(ctx),
                ctx,
            })
            .getManyAndCount()
            .then(([items, totalItems]) => ({ items, totalItems }));
    }

    findOne(ctx: RequestContext, id: ID): Promise<Complaint> {
        return this.connection.getEntityOrThrow(ctx, Complaint, id, {
            relations: ['order', 'customer', 'image'],
            where: this.inActiveChannel(ctx),
        });
    }

    async findAllForActiveCustomer(
        ctx: RequestContext,
        options?: ShopComplaintListOptions,
    ): Promise<PaginatedList<Complaint>> {
        let customer: Customer | undefined;
        if (ctx.activeUserId) {
            customer = await this.customerService.findOneByUserId(ctx, ctx.activeUserId);
        }
        if (!customer) {
            return { items: [], totalItems: 0 };
        }
        return this.listQueryBuilder
            .build(Complaint, options, {
                relations: ['order', 'customer', 'image'],
                where: { customer: { id: customer.id } },
                ctx,
            })
            .getManyAndCount()
            .then(([items, totalItems]) => ({ items, totalItems }));
    }

    async create(ctx: RequestContext, input: CreateComplaintInput): Promise<Complaint> {
        let customer: Customer | undefined;
        if (ctx.activeUserId) {
            customer = await this.customerService.findOneByUserId(ctx, ctx.activeUserId);
        }
        if (!customer) {
            throw new ForbiddenError();
        }
        const order = await this.connection.getEntityOrThrow(ctx, Order, input.orderId, {
            relations: ['customer'],
        });
        if (!order.customer || order.customer.id !== customer.id) {
            throw new ForbiddenError();
        }
        const existingComplaint = await this.connection.getRepository(ctx, Complaint).findOne({
            where: { order: { id: order.id } },
        });
        if (existingComplaint) {
            throw new UserInputError('You have already filed a complaint for this order.');
        }
        const complaint = new Complaint({
            customer,
            order,
            issueType: input.issueType,
            description: input.description,
            status: ComplaintStatus.Open,
        });
        if (input.image) {
            const asset = await this.assetService.create(ctx, { file: input.image });
            if (isGraphQlErrorResult(asset)) {
                throw new UserInputError(asset.message);
            }
            complaint.image = asset;
        }
        return this.connection.getRepository(ctx, Complaint).save(complaint);
    }

    async update(ctx: RequestContext, input: UpdateComplaintInput): Promise<Complaint> {
        const complaint = await this.connection.getEntityOrThrow(ctx, Complaint, input.id, {
            relations: ['order', 'customer', 'image'],
            where: this.inActiveChannel(ctx),
        });
        const updated = patchEntity(complaint, {
            // patchEntity writes an explicit null through, and status is not nullable.
            status: input.status ?? undefined,
            adminNote: input.adminNote,
        });
        return this.connection.getRepository(ctx, Complaint).save(updated);
    }

    /** A store's admins see only complaints on that store's orders; the default channel holds every order. */
    private inActiveChannel(ctx: RequestContext): FindOptionsWhere<Complaint> {
        return { order: { channels: { id: ctx.channelId } } };
    }
}
