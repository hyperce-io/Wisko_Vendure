import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, PaginatedList, Permission, RequestContext, Transaction } from '@vendure/core';

import {
    MutationUpdateComplaintArgs,
    QueryComplaintArgs,
    QueryComplaintsArgs,
} from '../../../codegen/adminTypes';
import { Complaint } from '../entities/complaint.entity';
import { ComplaintService } from '../services/complaint.service';

@Resolver()
export class ComplaintAdminResolver {
    constructor(private complaintService: ComplaintService) {}

    @Query()
    @Allow(Permission.ReadOrder)
    async complaints(
        @Ctx() ctx: RequestContext,
        @Args() args: QueryComplaintsArgs,
    ): Promise<PaginatedList<Complaint>> {
        return this.complaintService.findAll(ctx, args.options);
    }

    @Query()
    @Allow(Permission.ReadOrder)
    async complaint(@Ctx() ctx: RequestContext, @Args() args: QueryComplaintArgs): Promise<Complaint | null> {
        return this.complaintService.findOne(ctx, args.id);
    }

    @Transaction()
    @Mutation()
    @Allow(Permission.UpdateOrder)
    async updateComplaint(
        @Ctx() ctx: RequestContext,
        @Args() args: MutationUpdateComplaintArgs,
    ): Promise<Complaint> {
        return this.complaintService.update(ctx, args.input);
    }
}
