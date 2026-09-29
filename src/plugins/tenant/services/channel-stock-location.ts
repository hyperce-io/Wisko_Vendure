import {
    Channel,
    idsAreEqual,
    Logger,
    RequestContext,
    StockLocation,
    StockLocationService,
    TransactionalConnection,
} from '@vendure/core';
import { DEFAULT_CHANNEL_CODE } from '@vendure/common/lib/shared-constants';
import { In } from 'typeorm';

/**
 * The store channel's own StockLocation, created and assigned to the channel when it has none.
 *
 * Vendure's MultiChannelStockLocationStrategy only counts stock at locations assigned to the
 * shopper's channel, so a store without one of its own shows nothing in stock. A location shared
 * with another store does not count as its own: ERP sends each store's quantity separately, and a
 * shared location would let one store's number overwrite the other's.
 *
 * StockLocationService.create assigns the new location to the request's channel (the default
 * channel here, which sees every location) and it is then assigned to the store's channel.
 */
export async function ensureChannelStockLocation(
    connection: TransactionalConnection,
    stockLocationService: StockLocationService,
    ctx: RequestContext,
    channel: Channel,
): Promise<StockLocation> {
    const assignedIds = (
        await connection.getRepository(ctx, StockLocation).find({
            where: { channels: { id: channel.id } },
            select: { id: true },
        })
    ).map(location => location.id);

    if (assignedIds.length) {
        const assigned = await connection.getRepository(ctx, StockLocation).find({
            where: { id: In(assignedIds) },
            relations: { channels: true },
        });
        const ownLocation = assigned.find(location => {
            const storeChannels = location.channels.filter(c => c.code !== DEFAULT_CHANNEL_CODE);
            return storeChannels.length === 1 && idsAreEqual(storeChannels[0].id, channel.id);
        });
        if (ownLocation) return ownLocation;
    }

    const location = await stockLocationService.create(ctx, {
        name: channel.code,
        description: `Stock for channel ${channel.code}`,
    });
    await stockLocationService.assignStockLocationsToChannel(ctx, {
        stockLocationIds: [location.id],
        channelId: channel.id,
    });
    Logger.info(`Created stock location ${location.id} for channel ${channel.code}`, 'ChannelStockLocation');
    return location;
}
