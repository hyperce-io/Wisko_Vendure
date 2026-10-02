import {MigrationInterface, QueryRunner} from "typeorm";

export class AddCustomerErpCustomerId1790931985054 implements MigrationInterface {

   public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "customer" ADD "customFieldsErpcustomerid" character varying(255)`, undefined);
   }

   public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "customer" DROP COLUMN "customFieldsErpcustomerid"`, undefined);
   }

}
