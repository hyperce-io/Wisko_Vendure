import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, PaginatedList, Permission, RequestContext, Transaction } from '@vendure/core';

import { MutationCreateComplaintArgs, QueryActiveCustomerComplaintsArgs } from '../../../codegen/shopTypes';
import { Complaint } from '../entities/complaint.entity';
import { ComplaintService } from '../services/complaint.service';

@Resolver()
export class ComplaintShopResolver {
    constructor(private complaintService: ComplaintService) {}

    @Transaction()
    @Mutation()
    @Allow(Permission.Authenticated)
    async createComplaint(
        @Ctx() ctx: RequestContext,
        @Args() args: MutationCreateComplaintArgs,
    ): Promise<Complaint> {
        return this.complaintService.create(ctx, args.input);
    }

    @Query()
    @Allow(Permission.Authenticated)
    async activeCustomerComplaints(
        @Ctx() ctx: RequestContext,
        @Args() args: QueryActiveCustomerComplaintsArgs,
    ): Promise<PaginatedList<Complaint>> {
        return this.complaintService.findAllForActiveCustomer(ctx, args.options);
    }
}
