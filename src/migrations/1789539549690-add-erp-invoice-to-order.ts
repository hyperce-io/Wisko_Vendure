import {MigrationInterface, QueryRunner} from "typeorm";

export class AddErpInvoiceToOrder1789539549690 implements MigrationInterface {

   public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "order" ADD "customFieldsErpinvoiceid" integer`, undefined);
        await queryRunner.query(`ALTER TABLE "order" ADD "customFieldsErpinvoicekey" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "order" ADD CONSTRAINT "FK_1ee7a26879103572a78a9bc8620" FOREIGN KEY ("customFieldsErpinvoiceid") REFERENCES "asset"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`, undefined);
   }

   public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "order" DROP CONSTRAINT "FK_1ee7a26879103572a78a9bc8620"`, undefined);
        await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "customFieldsErpinvoicekey"`, undefined);
        await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "customFieldsErpinvoiceid"`, undefined);
   }

}
