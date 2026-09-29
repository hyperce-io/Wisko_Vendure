import { Injectable } from '@nestjs/common';
import {
    Channel,
    LanguageCode,
    Logger,
    PaymentMethod,
    PaymentMethodService,
    RequestContext,
    TransactionalConnection,
    UserInputError,
    idsAreEqual,
} from '@vendure/core';
import { WISKO_ERP_PAYMENT_HANDLER_CODE } from '../payment/wisko-erp-payment-handler';
import { SyncPaymentMethodInput } from '../types';

/**
 * Mirrors ERP payment methods (payment_method.created / updated / deleted) into Vendure.
 *
 * ERP sends one message per store with the same `code` for every store, because the method is a
 * single platform-wide record in ERP and only its per-store acceptance differs. That maps onto one
 * Vendure PaymentMethod per code, assigned to each accepting store's channel: checkout resolves a
 * method by code within the active channel (PaymentMethodService.getMethodAndOperations), and
 * name / description / enabled / type are global in ERP, so there is nothing per-channel to keep
 * apart. The method is created in the default channel (the super-admin context) and then assigned.
 */
@Injectable()
export class PaymentMethodSyncService {
    constructor(
        private connection: TransactionalConnection,
        private paymentMethodService: PaymentMethodService,
    ) {}

    async syncPaymentMethod(ctx: RequestContext, input: SyncPaymentMethodInput): Promise<void> {
        return this.connection.withTransaction(ctx, async txCtx => {
            const channel = await this.findChannelByErpChannelId(txCtx, input.erpChannelId);
            if (!channel) {
                // Thrown, not swallowed: the consumer nacks and the message lands on the DLQ.
                throw new UserInputError(`Channel with erpChannelId "${input.erpChannelId}" not found`);
            }

            const methodFields = {
                enabled: input.enabled,
                handler: {
                    code: WISKO_ERP_PAYMENT_HANDLER_CODE,
                    arguments: [{ name: 'erpType', value: input.type }],
                },
                translations: [
                    {
                        languageCode: LanguageCode.en,
                        name: input.name,
                        description: input.description ?? '',
                    },
                ],
            };

            const existing = await this.findByCode(txCtx, input.code);
            const paymentMethod = existing
                ? await this.paymentMethodService.update(txCtx, { id: existing.id, ...methodFields })
                : await this.paymentMethodService.create(txCtx, { code: input.code, ...methodFields });

            const isAssigned = (existing?.channels ?? []).some(assigned => idsAreEqual(assigned.id, channel.id));
            if (!isAssigned) {
                await this.paymentMethodService.assignPaymentMethodsToChannel(txCtx, {
                    paymentMethodIds: [paymentMethod.id],
                    channelId: channel.id,
                });
            }

            Logger.info(
                `${existing ? 'Updated' : 'Created'} payment method ${input.code} (${input.name}, ${input.type}) for channel ${channel.code}`,
                'PaymentMethodSync',
            );
        });
    }

    async removePaymentMethodFromChannel(
        ctx: RequestContext,
        input: Pick<SyncPaymentMethodInput, 'erpChannelId' | 'code'>,
    ): Promise<void> {
        return this.connection.withTransaction(ctx, async txCtx => {
            const channel = await this.findChannelByErpChannelId(txCtx, input.erpChannelId);
            const existing = await this.findByCode(txCtx, input.code);
            if (!channel || !existing?.channels.some(assigned => idsAreEqual(assigned.id, channel.id))) {
                Logger.info(
                    `Payment method ${input.code} is not assigned to channel ${input.erpChannelId}, nothing to remove`,
                    'PaymentMethodSync',
                );
                return;
            }

            await this.paymentMethodService.removePaymentMethodsFromChannel(txCtx, {
                paymentMethodIds: [existing.id],
                channelId: channel.id,
            });
            Logger.info(`Removed payment method ${input.code} from channel ${channel.code}`, 'PaymentMethodSync');
        });
    }

    private findByCode(ctx: RequestContext, code: string): Promise<PaymentMethod | null> {
        return this.connection
            .getRepository(ctx, PaymentMethod)
            .findOne({ where: { code }, relations: { channels: true } });
    }

    private findChannelByErpChannelId(ctx: RequestContext, erpChannelId: string): Promise<Channel | null> {
        return this.connection
            .getRepository(ctx, Channel)
            .findOne({ where: { customFields: { erpChannelId } } });
    }
}
