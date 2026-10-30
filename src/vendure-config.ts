import {
    dummyPaymentHandler,
    DefaultJobQueuePlugin,
    DefaultSchedulerPlugin,
    DefaultSearchPlugin,
    VendureConfig,
    LogLevel,
    DefaultLogger,
} from '@vendure/core';
import { defaultEmailHandlers, EmailPlugin, FileBasedTemplateLoader } from '@vendure/email-plugin';
import { AssetServerPlugin, configureS3AssetStorage } from '@vendure/asset-server-plugin';
import { DashboardPlugin } from '@vendure/dashboard/plugin';
import { GraphiqlPlugin } from '@vendure/graphiql-plugin';
import { TenantPlugin } from './plugins/tenant/tenant.plugin';
import { ComplaintPlugin } from './plugins/complaint/complaint.plugin';
import { FaqPlugin } from './plugins/faq/faq.plugin';
import { ReviewsPlugin } from './plugins/reviews/reviews.plugin';
import { WishlistPlugin } from './plugins/wishlist/wishlist.plugin';
import 'dotenv/config';
import path from 'path';

const IS_DEV = process.env.APP_ENV === 'dev';
const serverPort = +process.env.PORT || 3000;

export const config: VendureConfig = {
    logger: new DefaultLogger({ level: LogLevel.Verbose }),
    apiOptions: {
        port: serverPort,
        adminApiPath: 'admin-api',
        shopApiPath: 'shop-api',
        trustProxy: IS_DEV ? false : 1,
    },
    authOptions: {
        tokenMethod: ['bearer', 'cookie'],
        superadminCredentials: {
            identifier: process.env.SUPERADMIN_USERNAME,
            password: process.env.SUPERADMIN_PASSWORD,
        },
        cookieOptions: {
          secret: process.env.COOKIE_SECRET,
        },
    },
    dbConnectionOptions: {
        type: 'postgres',
        // See the README.md "Migrations" section for an explanation of
        // the `synchronize` and `migrations` options.
        synchronize: false,
        migrations: [path.join(__dirname, './migrations/*.+(js|ts)')],
        logging: false,
        database: process.env.DB_NAME,
        schema: process.env.DB_SCHEMA,
        host: process.env.DB_HOST,
        port: +process.env.DB_PORT,
        username: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
    },
    paymentOptions: {
        paymentMethodHandlers: [dummyPaymentHandler],
    },
    // When adding or altering custom field definitions, the database will
    // need to be updated. See the "Migrations" section in README.md.
    customFields: {},
    plugins: [
        GraphiqlPlugin.init(),
        AssetServerPlugin.init({
            route: 'assets',
            assetUploadDir: path.join(__dirname, '../static/assets'),
            assetUrlPrefix: IS_DEV ? undefined : process.env.ASSET_URL_PREFIX,
            // S3 storage in production, local filesystem in dev
            ...(process.env.S3_BUCKET ? {
                storageStrategyFactory: configureS3AssetStorage({
                    bucket: process.env.S3_BUCKET,
                    credentials: {
                        accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
                        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
                    },
                    nativeS3Configuration: {
                        region: process.env.S3_REGION || 'us-east-1',
                        endpoint: process.env.S3_ENDPOINT,
                        forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
                    },
                }),
            } : {}),
        }),
        DefaultSchedulerPlugin.init(),
        DefaultJobQueuePlugin.init({ useDatabaseForBuffer: true }),
        DefaultSearchPlugin.init({ bufferUpdates: false, indexStockStatus: true }),
        EmailPlugin.init({
            devMode: true,
            outputPath: path.join(__dirname, '../static/email/test-emails'),
            route: 'mailbox',
            handlers: defaultEmailHandlers,
            templateLoader: new FileBasedTemplateLoader(path.join(__dirname, '../static/email/templates')),
            globalTemplateVars: {
                // Links in customer emails point at the storefront; set these per environment.
                // The localhost defaults match a storefront running locally on port 8080.
                fromAddress: '"example" <noreply@example.com>',
                verifyEmailAddressUrl: process.env.VERIFY_EMAIL_URL || 'http://localhost:8080/verify',
                passwordResetUrl: process.env.PASSWORD_RESET_URL || 'http://localhost:8080/password-reset',
                changeEmailAddressUrl:
                    process.env.CHANGE_EMAIL_URL || 'http://localhost:8080/verify-email-address-change',
                adminUrl: process.env.ADMIN_URL || `http://localhost:${serverPort}/dashboard`,
            },
        }),
        DashboardPlugin.init({
            route: 'dashboard',
            appDir: IS_DEV
                ? path.join(__dirname, '../dist/dashboard')
                : path.join(__dirname, 'dashboard'),
        }),
        TenantPlugin,
        WishlistPlugin,
        ReviewsPlugin,
        FaqPlugin.init({}),
        ComplaintPlugin,
    ],
};
