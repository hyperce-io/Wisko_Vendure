import { Resolver, Query } from '@nestjs/graphql';
import { Ctx, RequestContext, ChannelService, Logger } from '@vendure/core';
import { TenantService } from '../services/tenant.service';
import '../types';

@Resolver()
export class TenantShopResolver {
    constructor(
        private channelService: ChannelService,
        private tenantService: TenantService,
    ) {}

    @Query()
    async availableStores(@Ctx() ctx: RequestContext) {
        // Get all channels that belong to a tenant (Level 3 — actual stores)
        // Exclude the default channel and any channel without a tenant
        const allChannels = await this.channelService.findAll(ctx);

        const storeChannels = allChannels.items.filter(ch => {
            // Skip default channel
            if (ch.code === '__default_channel__') return false;
            // Only include channels that have a tenant (i.e., actual stores)
            if (!ch.customFields.tenant) return false;
            return true;
        });

        return storeChannels.map(ch => ({
            id: String(ch.id),
            code: ch.code,
            token: ch.token,
            name: ch.code, // Channel doesn't have a name field — use code
            currencyCode: ch.defaultCurrencyCode,
            languageCode: ch.defaultLanguageCode,
        }));
    }
}
