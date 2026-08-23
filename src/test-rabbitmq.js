/**
 * Test script: sends all JSON contract scenarios to RabbitMQ and verifies processing.
 * Run: node src/test-rabbitmq.js
 */
const amqp = require('amqplib');

const RABBITMQ_URL = 'amqp://admin:admin@4.240.93.82:5672';
const EXCHANGE = 'wisko.sync';

async function run() {
    const conn = await amqp.connect(RABBITMQ_URL);
    const ch = await conn.createChannel();

    let step = 0;
    const send = async (key, data, label) => {
        step++;
        ch.publish(EXCHANGE, key, Buffer.from(JSON.stringify(data)));
        console.log(`[${step}] Sent: ${key} — ${label}`);
        await new Promise(r => setTimeout(r, 2500)); // wait for processing
    };

    // ====== CREATE ======

    // 1. Create Company only
    await send('company.created', {
        company: { code: 'nike', name: 'Nike', admin: { email: 'boss@nike.com', password: 'test123', firstName: 'Nike', lastName: 'Boss' } }
    }, 'Create company Nike + admin');

    // 2. Create another Company
    await send('company.created', {
        company: { code: 'jordan', name: 'Jordan Brand', admin: { email: 'boss@jordan.com', password: 'test123', firstName: 'Jordan', lastName: 'Boss' } }
    }, 'Create company Jordan + admin');

    // 3. Create Tenant under Nike
    await send('tenant.created', {
        company: { code: 'nike' },
        tenant: { code: 'nike-india', name: 'Nike India Pvt Ltd', admin: { email: 'admin@nike-india.com', password: 'test123', firstName: 'India', lastName: 'Admin' } }
    }, 'Create tenant Nike India + admin');

    // 4. Create another Tenant under Nike
    await send('tenant.created', {
        company: { code: 'nike' },
        tenant: { code: 'nike-uk', name: 'Nike UK Ltd', admin: { email: 'admin@nike-uk.com', password: 'test123', firstName: 'UK', lastName: 'Admin' } }
    }, 'Create tenant Nike UK + admin');

    // 5. Create Tenant under Jordan
    await send('tenant.created', {
        company: { code: 'jordan' },
        tenant: { code: 'jordan-mena', name: 'Jordan MENA', admin: { email: 'admin@jordan-mena.com', password: 'test123', firstName: 'MENA', lastName: 'Admin' } }
    }, 'Create tenant Jordan MENA + admin');

    // 6. Create Channel under Nike India
    await send('channel.created', {
        company: { code: 'nike' },
        tenant: { code: 'nike-india' },
        channel: { erpChannelId: 'ERP-NI-001', code: 'nike-india-mumbai', name: 'Mumbai Store', defaultCurrencyCode: 'INR', defaultLanguageCode: 'en' }
    }, 'Create channel mumbai under Nike India');

    // 7. Create another Channel under Nike India
    await send('channel.created', {
        company: { code: 'nike' },
        tenant: { code: 'nike-india' },
        channel: { erpChannelId: 'ERP-NI-002', code: 'nike-india-delhi', name: 'Delhi Store', defaultCurrencyCode: 'INR', defaultLanguageCode: 'en' }
    }, 'Create channel delhi under Nike India');

    // 8. Create Channel under Nike UK
    await send('channel.created', {
        company: { code: 'nike' },
        tenant: { code: 'nike-uk' },
        channel: { erpChannelId: 'ERP-NUK-001', code: 'nike-uk-london', name: 'London Store', defaultCurrencyCode: 'GBP', defaultLanguageCode: 'en' }
    }, 'Create channel london under Nike UK');

    // 9. Create Channel under Jordan MENA
    await send('channel.created', {
        company: { code: 'jordan' },
        tenant: { code: 'jordan-mena' },
        channel: { erpChannelId: 'ERP-JM-001', code: 'jordan-mena-dubai', name: 'Dubai Store', defaultCurrencyCode: 'AED', defaultLanguageCode: 'en' }
    }, 'Create channel dubai under Jordan MENA');

    // ====== UPDATE ======

    // 10. Update Company name
    await send('company.updated', {
        company: { code: 'nike', name: 'Nike Inc.' }
    }, 'Update company name Nike -> Nike Inc.');

    // 11. Update Tenant name
    await send('tenant.updated', {
        company: { code: 'nike' },
        tenant: { code: 'nike-india', name: 'Nike India Private Limited' }
    }, 'Update tenant name');

    // 12. Update Channel (re-send same erpChannelId = idempotent update)
    await send('channel.updated', {
        company: { code: 'nike' },
        tenant: { code: 'nike-india' },
        channel: { erpChannelId: 'ERP-NI-001', code: 'nike-india-mumbai', name: 'Mumbai Flagship', defaultCurrencyCode: 'INR' }
    }, 'Update channel mumbai (idempotent by erpChannelId)');

    // ====== ADD ADMIN ======

    // 13. Add a store-level staff
    await send('admin.created', {
        company: { code: 'nike' },
        tenant: { code: 'nike-india' },
        admin: { email: 'staff@mumbai.com', password: 'test123', firstName: 'Amit', lastName: 'Patel', role: 'store-staff', channelCodes: ['nike-india-mumbai'] }
    }, 'Add store staff for mumbai');

    // 14. Add a company-level admin
    await send('admin.created', {
        company: { code: 'nike' },
        admin: { email: 'regional@nike.com', password: 'test123', firstName: 'Sarah', lastName: 'Johnson', role: 'company-admin' }
    }, 'Add company-level admin');

    // ====== SUSPEND ======

    // 15. Suspend a tenant
    await send('tenant.updated', {
        company: { code: 'jordan' },
        tenant: { code: 'jordan-mena', enabled: false }
    }, 'Suspend tenant Jordan MENA');

    // ====== DELETE ======

    // 16. Deactivate an admin
    await send('admin.deactivated', {
        admin: { email: 'staff@mumbai.com' }
    }, 'Deactivate admin staff@mumbai.com');

    // 17. Delete a channel
    await send('channel.deleted', {
        channel: { erpChannelId: 'ERP-JM-001' }
    }, 'Delete channel dubai (ERP-JM-001)');

    // ====== FULL SYNC ======

    // 18. Full sync — create a new org at once
    await send('sync.full', {
        company: { code: 'adidas', name: 'Adidas AG', admin: { email: 'global@adidas.com', password: 'test123', firstName: 'Adidas', lastName: 'Global' } },
        tenants: [
            {
                code: 'adidas-eu',
                name: 'Adidas Europe',
                admin: { email: 'eu@adidas.com', password: 'test123', firstName: 'EU', lastName: 'Admin' },
                channels: [
                    { erpChannelId: 'ERP-AEU-001', code: 'adidas-berlin', defaultCurrencyCode: 'EUR' },
                    { erpChannelId: 'ERP-AEU-002', code: 'adidas-paris', defaultCurrencyCode: 'EUR' }
                ]
            }
        ]
    }, 'Full sync: Adidas + EU tenant + 2 channels');

    console.log('\n=== ALL 18 SCENARIOS SENT ===');
    console.log('Check worker logs for processing results.\n');

    await ch.close();
    await conn.close();
}

run().catch(e => console.error('Error:', e.message));
