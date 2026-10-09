import { Permission } from '@vendure/core';

/**
 * Promotions are managed in ERP and synced in (services/promotion-sync.service.ts); an edit made in
 * the dashboard would be overwritten by the next sync, so tenant admins may only read them.
 */
export const ERP_MANAGED_PERMISSIONS = [
    Permission.CreatePromotion,
    Permission.UpdatePromotion,
    Permission.DeletePromotion,
];

export const TENANT_ADMIN_PERMISSIONS = [
    Permission.ReadCatalog,
    Permission.CreateCatalog,
    Permission.UpdateCatalog,
    Permission.DeleteCatalog,
    Permission.ReadCustomer,
    Permission.CreateCustomer,
    Permission.UpdateCustomer,
    Permission.ReadOrder,
    Permission.UpdateOrder,
    Permission.ReadPromotion,
    Permission.ReadSettings,
    Permission.CreateChannel,
    Permission.ReadChannel,
    Permission.UpdateChannel,
    Permission.ReadShippingMethod,
    Permission.CreateShippingMethod,
    Permission.UpdateShippingMethod,
    Permission.ReadPaymentMethod,
    Permission.ReadAdministrator,
    Permission.CreateAdministrator,
    Permission.UpdateAdministrator,
    Permission.ReadAsset,
    Permission.CreateAsset,
    Permission.UpdateAsset,
    Permission.DeleteAsset,
];
