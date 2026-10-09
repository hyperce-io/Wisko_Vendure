import {MigrationInterface, QueryRunner} from "typeorm";

export class StrapiProductContent1791351757330 implements MigrationInterface {

   public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "product_translation" ADD "customFieldsShortdescription" text`, undefined);
        await queryRunner.query(`ALTER TABLE "product_translation" ADD "customFieldsSeotitle" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "product_translation" ADD "customFieldsSeodescription" text`, undefined);
        await queryRunner.query(`ALTER TABLE "product_translation" ADD "customFieldsSeoschema" text`, undefined);
        await queryRunner.query(`ALTER TABLE "product" ADD "customFieldsSpecs" text`, undefined);
        await queryRunner.query(`ALTER TABLE "asset" ADD "customFieldsSourceurl" text`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant_translation" ADD "customFieldsDescription" text`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant_translation" ADD "customFieldsShortdescription" text`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant_translation" ADD "customFieldsSeotitle" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant_translation" ADD "customFieldsSeodescription" text`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant_translation" ADD "customFieldsSeoschema" text`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant" ADD "customFieldsSpecs" text`, undefined);
   }

   public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "product_variant" DROP COLUMN "customFieldsSpecs"`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant_translation" DROP COLUMN "customFieldsSeoschema"`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant_translation" DROP COLUMN "customFieldsSeodescription"`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant_translation" DROP COLUMN "customFieldsSeotitle"`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant_translation" DROP COLUMN "customFieldsShortdescription"`, undefined);
        await queryRunner.query(`ALTER TABLE "product_variant_translation" DROP COLUMN "customFieldsDescription"`, undefined);
        await queryRunner.query(`ALTER TABLE "asset" DROP COLUMN "customFieldsSourceurl"`, undefined);
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "customFieldsSpecs"`, undefined);
        await queryRunner.query(`ALTER TABLE "product_translation" DROP COLUMN "customFieldsSeoschema"`, undefined);
        await queryRunner.query(`ALTER TABLE "product_translation" DROP COLUMN "customFieldsSeodescription"`, undefined);
        await queryRunner.query(`ALTER TABLE "product_translation" DROP COLUMN "customFieldsSeotitle"`, undefined);
        await queryRunner.query(`ALTER TABLE "product_translation" DROP COLUMN "customFieldsShortdescription"`, undefined);
   }

}
