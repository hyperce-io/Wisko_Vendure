import { Channel, ID, RequestContext, TransactionalConnection } from '@vendure/core';
import { DEFAULT_CHANNEL_CODE } from '@vendure/common/lib/shared-constants';
import { In } from 'typeorm';

export interface ErpChannelInfo {
    id: string;
    code: string;
    token: string;
    erpChannelId: string | null;
}

/**
 * Resolves the tenant Channel for an entity and reads its `erpChannelId`.
 *
 * Reading `entity.channels[n].customFields.erpChannelId` directly does NOT work on
 * freshly-created entities. `ChannelService.assignToCurrentChannel()` assigns stubs —
 * `entity.channels = channelIds.map(id => ({ id }))` — with no `code` and no
 * `customFields`, and `EntityHydrator.hydrate()` will not repair them: its
 * `getMissingRelations()` treats any already-populated array as loaded and skips the
 * re-fetch. So the stubs survive, `customFields` is `undefined`, and `erpChannelId`
 * silently comes out `null`.
 *
 * This re-loads the Channel rows by id so custom fields are always present. The
 * repository is resolved through `ctx` so the read joins any open transaction —
 * order state transitions publish their events from inside one.
 */
export async function resolveErpChannel(
    connection: TransactionalConnection,
    ctx: RequestContext,
    entityChannels: Array<{ id: ID }> | undefined | null,
): Promise<ErpChannelInfo | null> {
    const ids = (entityChannels ?? []).map(c => c.id).filter(id => id != null);
    // Fall back to the request's channel when the entity carries no channels at all.
    if (ids.length === 0 && ctx.channelId != null) {
        ids.push(ctx.channelId);
    }
    if (ids.length === 0) return null;

    const channels = await connection
        .getRepository(ctx, Channel)
        .find({ where: { id: In(ids) } });
    if (channels.length === 0) return null;

    // Prefer the tenant channel; the default channel is only a fallback.
    const channel =
        channels.find(c => c.code !== DEFAULT_CHANNEL_CODE) ?? channels[0];

    return {
        id: String(channel.id),
        code: channel.code,
        token: channel.token,
        erpChannelId: channel.customFields?.erpChannelId ?? null,
    };
}
