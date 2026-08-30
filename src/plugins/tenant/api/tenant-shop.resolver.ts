import { Resolver, Query } from '@nestjs/graphql';
import { Ctx, RequestContext, TransactionalConnection, Channel, Allow, Permission } from '@vendure/core';
import '../types';

@Resolver()
export class TenantShopResolver {
    constructor(
        private connection: TransactionalConnection,
    ) {}

    @Query()
    @Allow(Permission.Public)
    async availableStores(@Ctx() ctx: RequestContext) {
        // Query all channels that have a tenant assigned (Level 3 — actual stores)
        // Uses raw connection to bypass channel-scoping (Shop API context is scoped to one channel)
        const channels = await this.connection.rawConnection
            .getRepository(Channel)
            .createQueryBuilder('channel')
            .where('channel.code != :default', { default: '__default_channel__' })
            .andWhere('channel."customFieldsTenantid" IS NOT NULL')
            .getMany();

        return channels.map(ch => ({
            id: String(ch.id),
            code: ch.code,
            token: ch.token,
            name: ch.code,
            currencyCode: ch.defaultCurrencyCode,
            languageCode: ch.defaultLanguageCode,
        }));
    }
}
