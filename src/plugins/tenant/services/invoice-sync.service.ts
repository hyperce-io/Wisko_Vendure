import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import path from 'path';
import { Readable } from 'stream';
import {
    Asset,
    AssetService,
    Logger,
    Order,
    OrderService,
    RequestContext,
    TransactionalConnection,
    isGraphQlErrorResult,
} from '@vendure/core';
import { SyncInvoiceInput } from '../types';

/** Give up rather than hold a consumer thread open on a stalled download. */
const DOWNLOAD_TIMEOUT_MS = 30_000;

@Injectable()
export class InvoiceSyncService {
    constructor(
        private connection: TransactionalConnection,
        private orderService: OrderService,
        private assetService: AssetService,
    ) {}

    /**
     * Attaches an ERP-generated invoice PDF to an Order.
     *
     * ERP sends a time-limited Azure SAS link (`?se=<expiry>`) into a private
     * container, so the URL is useless once it expires — a month, in the samples
     * we were sent. The PDF is therefore downloaded while the link is still
     * signed and stored as a Vendure Asset; only the permanent asset is kept.
     */
    async attachInvoice(ctx: RequestContext, input: SyncInvoiceInput): Promise<void> {
        const order = await this.orderService.findOneByCode(ctx, input.orderCode);
        if (!order) {
            // Thrown, not swallowed: the consumer nacks and the message lands on
            // the DLQ, so an invoice for an unknown order is visible rather than lost.
            throw new Error(`Order "${input.orderCode}" not found`);
        }

        // ERP re-sends on retry; the idempotency key is what makes that safe.
        if (input.idempotencyKey && order.customFields?.erpInvoiceKey === input.idempotencyKey) {
            Logger.info(
                `Invoice already attached to order ${input.orderCode} (${input.idempotencyKey}), skipping`,
                'InvoiceSync',
            );
            return;
        }

        const asset = await this.downloadAsAsset(ctx, input.fileUrl);

        await this.connection.getRepository(ctx, Order).save(
            {
                id: order.id,
                customFields: {
                    ...order.customFields,
                    erpInvoice: asset,
                    erpInvoiceKey: input.idempotencyKey ?? null,
                },
            } as any,
            { reload: false },
        );

        Logger.info(
            `Attached invoice asset ${asset.id} to order ${input.orderCode}`,
            'InvoiceSync',
        );
    }

    private async downloadAsAsset(ctx: RequestContext, fileUrl: string): Promise<Asset> {
        const response = await fetch(fileUrl, {
            signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
        });
        if (!response.ok || !response.body) {
            throw new Error(
                `Invoice download failed: ${response.status} ${response.statusText}. ` +
                    'The SAS link may have expired before the message was processed.',
            );
        }

        const stream = Readable.fromWeb(response.body as any);
        const result = await this.assetService.createFromFileStream(stream, this.assetFileName(fileUrl), ctx);
        if (isGraphQlErrorResult(result)) {
            throw new Error(`Invoice asset creation failed: ${result.message}`);
        }
        return result;
    }

    /**
     * Vendure serves assets publicly at a URL derived from the filename, and ERP
     * invoice numbers are sequential (ACC-SINV-2026-00014), so storing them under
     * their own name would let anyone enumerate every customer's invoice. A random
     * suffix makes the resulting URL unguessable.
     */
    private assetFileName(fileUrl: string): string {
        let base = 'invoice.pdf';
        try {
            base = path.basename(new URL(fileUrl).pathname) || base;
        } catch {
            // Not a parseable URL — fall back to the generic name.
        }
        const ext = path.extname(base) || '.pdf';
        return `${path.basename(base, ext)}-${randomBytes(12).toString('hex')}${ext}`;
    }
}
