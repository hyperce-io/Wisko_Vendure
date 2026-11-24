import {MigrationInterface, QueryRunner} from "typeorm";

export class ZitadelRoleSync1795510368032 implements MigrationInterface {

   public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "administrator" RENAME COLUMN "customFields__fix_relational_custom_fields__" TO "customFieldsWiskoroleposition"`, undefined);
        await queryRunner.query(`ALTER TABLE "role" ADD "customFieldsWiskoscopeuids" text`, undefined);
        await queryRunner.query(`ALTER TABLE "administrator" DROP COLUMN "customFieldsWiskoroleposition"`, undefined);
        await queryRunner.query(`ALTER TABLE "administrator" ADD "customFieldsWiskoroleposition" character varying(255)`, undefined);
   }

   public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "administrator" DROP COLUMN "customFieldsWiskoroleposition"`, undefined);
        await queryRunner.query(`ALTER TABLE "administrator" ADD "customFieldsWiskoroleposition" boolean`, undefined);
        await queryRunner.query(`ALTER TABLE "role" DROP COLUMN "customFieldsWiskoscopeuids"`, undefined);
        await queryRunner.query(`ALTER TABLE "administrator" RENAME COLUMN "customFieldsWiskoroleposition" TO "customFields__fix_relational_custom_fields__"`, undefined);
   }

}
