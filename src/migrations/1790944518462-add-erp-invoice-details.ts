import {MigrationInterface, QueryRunner} from "typeorm";

export class AddErpInvoiceDetails1790944518462 implements MigrationInterface {

   public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "order" ADD "customFieldsErpinvoicenumber" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "order" ADD "customFieldsErpinvoicedate" TIMESTAMP(6)`, undefined);
        await queryRunner.query(`ALTER TABLE "order" ADD "customFieldsErpinvoicestatus" character varying(255)`, undefined);
   }

   public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "customFieldsErpinvoicestatus"`, undefined);
        await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "customFieldsErpinvoicedate"`, undefined);
        await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "customFieldsErpinvoicenumber"`, undefined);
   }

}
