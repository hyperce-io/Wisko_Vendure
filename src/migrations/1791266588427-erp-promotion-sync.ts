import {MigrationInterface, QueryRunner} from "typeorm";

export class ErpPromotionSync1791266588427 implements MigrationInterface {

   public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "promotion" ADD "customFieldsErppromotionid" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "promotion" ADD CONSTRAINT "UQ_b28907b8149c2dce572ae682f0f" UNIQUE ("customFieldsErppromotionid")`, undefined);
        await queryRunner.query(`ALTER TABLE "promotion" ADD "customFieldsErpmodifiedat" TIMESTAMP(6)`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant" ADD "customFieldsErpitemgroups" text`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant" ADD "customFieldsErpbrand" character varying(255)`, undefined);
   }

   public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "product_variant" DROP COLUMN "customFieldsErpbrand"`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant" DROP COLUMN "customFieldsErpitemgroups"`, undefined);
        await queryRunner.query(`ALTER TABLE "promotion" DROP COLUMN "customFieldsErpmodifiedat"`, undefined);
        await queryRunner.query(`ALTER TABLE "promotion" DROP CONSTRAINT "UQ_b28907b8149c2dce572ae682f0f"`, undefined);
        await queryRunner.query(`ALTER TABLE "promotion" DROP COLUMN "customFieldsErppromotionid"`, undefined);
   }

}
