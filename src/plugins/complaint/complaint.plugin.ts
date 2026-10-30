import { PluginCommonModule, VendurePlugin } from '@vendure/core';

import { adminApiExtensions, shopApiExtensions } from './api/api-extensions';
import { ComplaintAdminResolver } from './api/complaint-admin.resolver';
import { ComplaintShopResolver } from './api/complaint-shop.resolver';
import { Complaint } from './entities/complaint.entity';
import { ComplaintService } from './services/complaint.service';

@VendurePlugin({
    imports: [PluginCommonModule],
    entities: [Complaint],
    providers: [ComplaintService],
    adminApiExtensions: {
        schema: adminApiExtensions,
        resolvers: [ComplaintAdminResolver],
    },
    shopApiExtensions: {
        schema: shopApiExtensions,
        resolvers: [ComplaintShopResolver],
    },
    dashboard: './dashboard/index.tsx',
    compatibility: '^3.0.0',
})
export class ComplaintPlugin {}
