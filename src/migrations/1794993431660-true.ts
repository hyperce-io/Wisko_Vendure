import {MigrationInterface, QueryRunner} from "typeorm";

export class True1794993431660 implements MigrationInterface {

   public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "promotion" ADD "customFieldsCouponrequestkey" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "promotion" ADD CONSTRAINT "UQ_1851a897f2613ce43bbfc59c3c6" UNIQUE ("customFieldsCouponrequestkey")`, undefined);
        await queryRunner.query(`ALTER TABLE "order" ADD "customFieldsUtmsource" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "order" ADD "customFieldsUtmmedium" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "order" ADD "customFieldsUtmcampaign" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "order" ADD "customFieldsUtmcontent" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "order" ADD "customFieldsUtmterm" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "customer" ADD "customFieldsDateofbirth" TIMESTAMP(6)`, undefined);
        await queryRunner.query(`ALTER TABLE "customer" ADD "customFieldsErasurerequestid" character varying(255)`, undefined);
   }

   public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "customer" DROP COLUMN "customFieldsErasurerequestid"`, undefined);
        await queryRunner.query(`ALTER TABLE "customer" DROP COLUMN "customFieldsDateofbirth"`, undefined);
        await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "customFieldsUtmterm"`, undefined);
        await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "customFieldsUtmcontent"`, undefined);
        await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "customFieldsUtmcampaign"`, undefined);
        await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "customFieldsUtmmedium"`, undefined);
        await queryRunner.query(`ALTER TABLE "order" DROP COLUMN "customFieldsUtmsource"`, undefined);
        await queryRunner.query(`ALTER TABLE "promotion" DROP CONSTRAINT "UQ_1851a897f2613ce43bbfc59c3c6"`, undefined);
        await queryRunner.query(`ALTER TABLE "promotion" DROP COLUMN "customFieldsCouponrequestkey"`, undefined);
   }

}
