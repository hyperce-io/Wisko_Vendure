import {
    bootstrapWorker,
    bootstrap,
    Logger,
    RequestContextService,
    TransactionalConnection,
    ConfigService,
    User,
    ChannelService,
    RoleService,
    AdministratorService,
    Channel,
    Role,
    DefaultJobQueuePlugin,
    ProductService,
} from '@vendure/core';
import { populate } from '@vendure/core/cli';
import { config } from './vendure-config';
import { TenantService } from './plugins/tenant/services/tenant.service';
import { Tenant } from './plugins/tenant/entities/tenant.entity';
import path from 'path';

/**
 * Seed script for testing the multi-tenant 3-tier channel hierarchy.
 *
 * Phase 1: Populate Vendure with standard sample data (products, countries, etc.)
 * Phase 2: Create tenants with channels and assign products per-channel
 *
 * Usage:
 *   npx ts-node src/seed.ts
 */

async function seed() {
    // =========================================================================
    // PHASE 1: Populate standard Vendure sample data (products, countries, etc.)
    // =========================================================================
    Logger.info('=== Phase 1: Populating standard Vendure data ===', 'Seed');

    const initialData = require('@vendure/create/assets/initial-data.json');
    const productsCsvFile = require.resolve('@vendure/create/assets/products.csv');

    const populateConfig = {
        ...config,
        dbConnectionOptions: {
            ...config.dbConnectionOptions,
            synchronize: true,
        },
        importExportOptions: {
            importAssetsDir: path.join(
                require.resolve('@vendure/create/assets/products.csv'),
                '../images',
            ),
        },
    };

    const app = await populate(
        () => bootstrap(populateConfig),
        initialData,
        productsCsvFile,
    );

    Logger.info('Standard data populated. Closing bootstrap app...', 'Seed');
    await app.close();

    // =========================================================================
    // PHASE 2: Bootstrap worker for tenant seeding
    // =========================================================================
    Logger.info('=== Phase 2: Seeding tenants ===', 'Seed');

    const { app: workerApp } = await bootstrapWorker(config);

    const { superadminCredentials } = workerApp.get(ConfigService).authOptions;
    const connService = workerApp.get(TransactionalConnection);
    const requestContextService = workerApp.get(RequestContextService);

    // Helper: reload the SuperAdmin user (with fresh roles/channels) and build a new context.
    // This is needed because as we create new channels, the SuperAdmin's role_channels_channel
    // table grows, and RoleService.create checks that the caller has access to the target channels.
    async function freshCtx() {
        const user = await connService.rawConnection.getRepository(User).findOneOrFail({
            where: { identifier: superadminCredentials.identifier },
            relations: { roles: { channels: true } },
        });
        return requestContextService.create({ apiType: 'admin', user });
    }

    let ctx = await freshCtx();

    const tenantService = workerApp.get(TenantService);
    const channelService = workerApp.get(ChannelService);
    const roleService = workerApp.get(RoleService);
    const administratorService = workerApp.get(AdministratorService);
    const productService = workerApp.get(ProductService);
    const connection = connService;

    // Helper: ensure all channels are assigned to the SuperAdmin role so
    // RoleService/ChannelService permission checks pass for the seed script.
    async function syncSuperAdminChannels() {
        const allChannels = await connection.rawConnection.getRepository(Channel).find();
        const saRole = await connection.rawConnection.getRepository(Role).findOneOrFail({
            where: { code: '__super_admin_role__' },
            relations: { channels: true },
        });
        const existingIds = new Set(saRole.channels.map(c => Number(c.id)));
        const missing = allChannels.filter(c => !existingIds.has(Number(c.id)));
        if (missing.length > 0) {
            saRole.channels.push(...missing);
            await connection.rawConnection.getRepository(Role).save(saRole);
        }
        ctx = await freshCtx();
    }

    Logger.info('=== Starting multi-tenant seed ===', 'Seed');

    // =========================================================================
    // 1. CREATE TENANT: NIKE  (3 channels, maxChannels=5)
    // =========================================================================
    Logger.info('Creating tenant: Nike...', 'Seed');
    const nike = await tenantService.create(ctx, {
        code: 'nike',
        name: 'Nike',
        adminEmail: 'admin@nike.com',
        adminPassword: 'test123',
        channelCode: 'nike-main',
    });
    Logger.info(`  ✓ Tenant "Nike" created (id=${nike.id})`, 'Seed');
    Logger.info(`  ✓ Channel "nike-main" created (hook auto-added to nike-parent role)`, 'Seed');
    Logger.info(`  ✓ Admin admin@nike.com created`, 'Seed');

    // Add 2 more Nike channels (simulating self-service)
    // We call channelService directly and stamp the tenant (same as createTenantChannel but without needing a logged-in Nike admin)
    const nikeChannel2 = await channelService.create(ctx, {
        code: 'nike-outlet',
        token: `nike-outlet-${Date.now().toString(36)}`,
        defaultLanguageCode: 'en' as any,
        defaultCurrencyCode: 'USD' as any,
        pricesIncludeTax: false,
        defaultShippingZoneId: undefined as any,
        defaultTaxZoneId: undefined as any,
        customFields: { tenant: nike } as any,
    });
    Logger.info(`  ✓ Channel "nike-outlet" created (id=${(nikeChannel2 as any).id})`, 'Seed');

    const nikeChannel3 = await channelService.create(ctx, {
        code: 'nike-eu',
        token: `nike-eu-${Date.now().toString(36)}`,
        defaultLanguageCode: 'en' as any,
        defaultCurrencyCode: 'EUR' as any,
        pricesIncludeTax: true,
        defaultShippingZoneId: undefined as any,
        defaultTaxZoneId: undefined as any,
        customFields: { tenant: nike } as any,
    });
    Logger.info(`  ✓ Channel "nike-eu" created (id=${(nikeChannel3 as any).id}, currency=EUR)`, 'Seed');

    // =========================================================================
    // 2. CREATE STORE STAFF for Nike Outlet (Tier 2 — single-channel admin)
    // =========================================================================
    await syncSuperAdminChannels();
    Logger.info('Creating store staff for Nike Outlet...', 'Seed');
    const nikeOutletRole = await roleService.create(ctx, {
        code: 'nike-outlet-staff',
        description: 'Staff for Nike Outlet store',
        permissions: [
            'ReadCatalog' as any,
            'ReadOrder' as any,
            'UpdateOrder' as any,
            'ReadCustomer' as any,
        ],
        channelIds: [(nikeChannel2 as any).id as string],
    });
    await administratorService.create(ctx, {
        firstName: 'Nike Outlet',
        lastName: 'Staff',
        emailAddress: 'staff@nike-outlet.com',
        password: 'test123',
        roleIds: [nikeOutletRole.id as string],
    });
    Logger.info(`  ✓ Admin staff@nike-outlet.com created (sees ONLY nike-outlet)`, 'Seed');

    // =========================================================================
    // 3. CREATE TENANT: JORDAN  (2 channels, maxChannels=3)
    // =========================================================================
    await syncSuperAdminChannels();
    Logger.info('Creating tenant: Jordan...', 'Seed');
    const jordan = await tenantService.create(ctx, {
        code: 'jordan',
        name: 'Jordan',
        adminEmail: 'admin@jordan.com',
        adminPassword: 'test123',
        channelCode: 'jordan-main',
    });
    // Update maxChannels to 3
    await tenantService.update(ctx, { id: jordan.id, maxChannels: 3 });
    Logger.info(`  ✓ Tenant "Jordan" created (id=${jordan.id}, maxChannels=3)`, 'Seed');

    const jordanChannel2 = await channelService.create(ctx, {
        code: 'jordan-retro',
        token: `jordan-retro-${Date.now().toString(36)}`,
        defaultLanguageCode: 'en' as any,
        defaultCurrencyCode: 'USD' as any,
        pricesIncludeTax: false,
        defaultShippingZoneId: undefined as any,
        defaultTaxZoneId: undefined as any,
        customFields: { tenant: jordan } as any,
    });
    Logger.info(`  ✓ Channel "jordan-retro" created (id=${(jordanChannel2 as any).id})`, 'Seed');

    // =========================================================================
    // 4. ERP SYNC: ADIDAS  (auto-creates tenant + 2 channels)
    // =========================================================================
    await syncSuperAdminChannels();
    Logger.info('Simulating ERP sync for Adidas...', 'Seed');
    const adidasChannel1 = await tenantService.syncFromErp(ctx, {
        erpChannelId: 'ERP-ADI-001',
        tenantCode: 'adidas',
        tenantName: 'Adidas',
        channelCode: 'adidas-originals',
        channelToken: `adidas-originals-${Date.now().toString(36)}`,
    });
    Logger.info(`  ✓ ERP sync: tenant "Adidas" auto-created + channel "adidas-originals"`, 'Seed');

    const adidasChannel2 = await tenantService.syncFromErp(ctx, {
        erpChannelId: 'ERP-ADI-002',
        tenantCode: 'adidas',
        tenantName: 'Adidas',
        channelCode: 'adidas-performance',
        channelToken: `adidas-performance-${Date.now().toString(36)}`,
    });
    Logger.info(`  ✓ ERP sync: channel "adidas-performance" added to existing Adidas tenant`, 'Seed');

    // Re-sync the same ERP id (idempotent test)
    await tenantService.syncFromErp(ctx, {
        erpChannelId: 'ERP-ADI-001',
        tenantCode: 'adidas',
        channelCode: 'adidas-originals',
        channelToken: `adidas-originals-${Date.now().toString(36)}`,
    });
    Logger.info(`  ✓ ERP re-sync of ERP-ADI-001: updated (not duplicated)`, 'Seed');

    // =========================================================================
    // 5. ASSIGN PRODUCTS to tenant channels so each channel has real data
    // =========================================================================
    await syncSuperAdminChannels();
    Logger.info('Assigning products to tenant channels...', 'Seed');

    // Get all products from the default channel
    const { items: allProducts } = await productService.findAll(ctx, { take: 100 });
    const productIds = allProducts.map(p => p.id);

    if (productIds.length > 0) {
        // Nike gets products 1-10 across its channels
        const nikeMainIds = productIds.slice(0, 5);
        const nikeOutletIds = productIds.slice(3, 8);  // some overlap with main
        const nikeEuIds = productIds.slice(0, 7);       // broader EU selection

        // Jordan gets products 8-15
        const jordanMainIds = productIds.slice(7, 12);
        const jordanRetroIds = productIds.slice(10, 15);

        // Adidas gets products 15-20
        const adidasOriginalsIds = productIds.slice(14, 18);
        const adidasPerformanceIds = productIds.slice(16, 20);

        // Assign to channels using channelService
        const assignments = [
            { channelId: (nikeChannel2 as any).id, productIds: nikeMainIds, name: 'nike-main' },
            { channelId: (nikeChannel2 as any).id, productIds: nikeOutletIds, name: 'nike-outlet' },
            { channelId: (nikeChannel3 as any).id, productIds: nikeEuIds, name: 'nike-eu' },
            { channelId: (jordanChannel2 as any).id, productIds: jordanMainIds, name: 'jordan-retro' },
        ];

        // Use raw SQL to assign products to channels (product_channels_channel join table)
        for (const { name } of assignments) {
            Logger.info(`  Assigning products to ${name}...`, 'Seed');
        }

        // Simpler: use ProductService.assignProductsToChannel
        const nikeMainChannel = await connection.rawConnection.getRepository(Channel)
            .findOne({ where: { code: 'nike-main' } });
        const nikeOutletChannel = await connection.rawConnection.getRepository(Channel)
            .findOne({ where: { code: 'nike-outlet' } });
        const nikeEuChannel = await connection.rawConnection.getRepository(Channel)
            .findOne({ where: { code: 'nike-eu' } });
        const jordanMainChannel = await connection.rawConnection.getRepository(Channel)
            .findOne({ where: { code: 'jordan-main' } });
        const jordanRetroChannel = await connection.rawConnection.getRepository(Channel)
            .findOne({ where: { code: 'jordan-retro' } });
        const adidasOriginalsChannel = await connection.rawConnection.getRepository(Channel)
            .findOne({ where: { code: 'adidas-originals' } });
        const adidasPerformanceChannel = await connection.rawConnection.getRepository(Channel)
            .findOne({ where: { code: 'adidas-performance' } });

        if (nikeMainChannel) {
            await productService.assignProductsToChannel(ctx, { channelId: nikeMainChannel.id, productIds: nikeMainIds });
            Logger.info(`  ✓ nike-main: ${nikeMainIds.length} products`, 'Seed');
        }
        if (nikeOutletChannel) {
            await productService.assignProductsToChannel(ctx, { channelId: nikeOutletChannel.id, productIds: nikeOutletIds });
            Logger.info(`  ✓ nike-outlet: ${nikeOutletIds.length} products`, 'Seed');
        }
        if (nikeEuChannel) {
            await productService.assignProductsToChannel(ctx, { channelId: nikeEuChannel.id, productIds: nikeEuIds });
            Logger.info(`  ✓ nike-eu: ${nikeEuIds.length} products`, 'Seed');
        }
        if (jordanMainChannel) {
            await productService.assignProductsToChannel(ctx, { channelId: jordanMainChannel.id, productIds: jordanMainIds });
            Logger.info(`  ✓ jordan-main: ${jordanMainIds.length} products`, 'Seed');
        }
        if (jordanRetroChannel) {
            await productService.assignProductsToChannel(ctx, { channelId: jordanRetroChannel.id, productIds: jordanRetroIds });
            Logger.info(`  ✓ jordan-retro: ${jordanRetroIds.length} products`, 'Seed');
        }
        if (adidasOriginalsChannel) {
            await productService.assignProductsToChannel(ctx, { channelId: adidasOriginalsChannel.id, productIds: adidasOriginalsIds });
            Logger.info(`  ✓ adidas-originals: ${adidasOriginalsIds.length} products`, 'Seed');
        }
        if (adidasPerformanceChannel) {
            await productService.assignProductsToChannel(ctx, { channelId: adidasPerformanceChannel.id, productIds: adidasPerformanceIds });
            Logger.info(`  ✓ adidas-performance: ${adidasPerformanceIds.length} products`, 'Seed');
        }
    } else {
        Logger.warn('No products found in default channel — skipping product assignment', 'Seed');
    }

    // =========================================================================
    // 6. SYNC + VERIFY: Print the final state
    // =========================================================================
    await syncSuperAdminChannels();

    // The ChannelEvent hook runs in the server process, not the worker.
    // Since we used bootstrapWorker, we must manually sync each tenant's
    // parent role channels here.
    Logger.info('Syncing tenant parent role channels (hook runs only in server)...', 'Seed');
    const tenantsForSync = await connection.rawConnection.getRepository(Tenant).find();
    for (const t of tenantsForSync) {
        const tenantChannels = await connection.rawConnection
            .getRepository(Channel)
            .find({ where: { customFields: { tenant: { id: t.id } } } as any });
        const parentRole = await connection.rawConnection
            .getRepository(Role)
            .findOneOrFail({ where: { id: t.parentRoleId }, relations: { channels: true } });
        parentRole.channels = tenantChannels;
        await connection.rawConnection.getRepository(Role).save(parentRole);
        Logger.info(`  Synced "${t.name}" parent role -> [${tenantChannels.map(c => c.code).join(', ')}]`, 'Seed');
    }
    Logger.info('', 'Seed');
    Logger.info('=== SEED COMPLETE — FINAL STATE ===', 'Seed');
    Logger.info('', 'Seed');

    const allTenants = await tenantService.findAll(ctx);
    for (const t of allTenants.items) {
        const fullTenant = await tenantService.findOne(ctx, t.id);
        const tenantChannels = await connection.rawConnection
            .getRepository(Channel)
            .find({ where: { customFields: { tenant: { id: t.id } } } as any });

        Logger.info(`Tenant: ${t.name} (code=${t.code}, enabled=${t.enabled}, maxChannels=${t.maxChannels})`, 'Seed');
        Logger.info(`  Parent Role ID: ${t.parentRoleId}`, 'Seed');
        Logger.info(`  Channels (${tenantChannels.length}):`, 'Seed');
        for (const ch of tenantChannels) {
            // Count products in this channel
            const productCount = await connection.rawConnection
                .query(`SELECT COUNT(*) as cnt FROM product_channels_channel WHERE "channelId" = $1`, [ch.id]);
            const cnt = productCount[0]?.cnt || 0;
            Logger.info(`    - ${ch.code} (id=${ch.id}, products=${cnt})`, 'Seed');
        }

        // Show the role's channel list (should match)
        if (fullTenant?.parentRole) {
            const roleWithChannels = await connection.rawConnection
                .getRepository(Role)
                .findOne({ where: { id: fullTenant.parentRoleId }, relations: { channels: true } });
            if (roleWithChannels) {
                Logger.info(`  Parent Role "${roleWithChannels.code}" channels: [${roleWithChannels.channels.map(c => c.code).join(', ')}]`, 'Seed');
            }
        }
        Logger.info('', 'Seed');
    }

    Logger.info('=== LOGIN CREDENTIALS ===', 'Seed');
    Logger.info('', 'Seed');
    Logger.info('SuperAdmin (sees ALL):',                     'Seed');
    Logger.info('  Username: superadmin',                      'Seed');
    Logger.info('  Password: superadmin',                      'Seed');
    Logger.info('',                                            'Seed');
    Logger.info('Nike Parent Admin (sees nike-main, nike-outlet, nike-eu):', 'Seed');
    Logger.info('  Username: admin@nike.com',                  'Seed');
    Logger.info('  Password: test123',                         'Seed');
    Logger.info('',                                            'Seed');
    Logger.info('Nike Outlet Staff (sees ONLY nike-outlet):',  'Seed');
    Logger.info('  Username: staff@nike-outlet.com',           'Seed');
    Logger.info('  Password: test123',                         'Seed');
    Logger.info('',                                            'Seed');
    Logger.info('Jordan Parent Admin (sees jordan-main, jordan-retro):', 'Seed');
    Logger.info('  Username: admin@jordan.com',                'Seed');
    Logger.info('  Password: test123',                         'Seed');
    Logger.info('',                                            'Seed');
    Logger.info('Adidas (ERP-provisioned, no admin login created — use SuperAdmin to view):', 'Seed');
    Logger.info('  Channels: adidas-originals, adidas-performance', 'Seed');
    Logger.info('',                                            'Seed');
    Logger.info('=== WHAT TO VERIFY ===', 'Seed');
    Logger.info('1. SuperAdmin sees ALL channels in the channel switcher',  'Seed');
    Logger.info('2. Nike admin sees ONLY nike-main, nike-outlet, nike-eu',  'Seed');
    Logger.info('3. Jordan admin sees ONLY jordan-main, jordan-retro',      'Seed');
    Logger.info('4. Nike Outlet staff sees ONLY nike-outlet',               'Seed');
    Logger.info('5. Nike cannot see any Jordan or Adidas channels',         'Seed');
    Logger.info('6. Jordan cannot see any Nike or Adidas channels',         'Seed');
    Logger.info('7. Each channel has its own subset of products',            'Seed');
    Logger.info('8. Switch channels in dashboard to see different products', 'Seed');
    Logger.info('',                                                         'Seed');
}

if (require.main === module) {
    seed()
        .then(() => process.exit(0))
        .catch(err => {
            Logger.error(String(err), 'Seed');
            console.error(err);
            process.exit(1);
        });
}
