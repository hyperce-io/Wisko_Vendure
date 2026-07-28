import { Tenant } from './entities/tenant.entity';

declare module '@vendure/core/dist/entity/custom-entity-fields' {
    interface CustomChannelFields {
        tenant: Tenant | null;
        erpChannelId: string | null;
    }
    interface CustomAdministratorFields {
        tenant: Tenant | null;
    }
}
