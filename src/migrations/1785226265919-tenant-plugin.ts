import {MigrationInterface, QueryRunner} from "typeorm";

export class TenantPlugin1785226265919 implements MigrationInterface {

   public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`CREATE TABLE "tenant" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "code" character varying NOT NULL, "name" character varying NOT NULL, "enabled" boolean NOT NULL DEFAULT true, "maxChannels" integer NOT NULL DEFAULT '5', "id" SERIAL NOT NULL, "parentRoleId" integer NOT NULL, CONSTRAINT "PK_da8c6efd67bb301e810e56ac139" PRIMARY KEY ("id"))`, undefined);
        await queryRunner.query(`ALTER TABLE "administrator" ADD "customFieldsTenantid" integer`, undefined);
        await queryRunner.query(`ALTER TABLE "administrator" ADD "customFields__fix_relational_custom_fields__" boolean`, undefined);
        await queryRunner.query(`COMMENT ON COLUMN "administrator"."customFields__fix_relational_custom_fields__" IS 'A work-around needed when only relational custom fields are defined on an entity'`, undefined);
        await queryRunner.query(`ALTER TABLE "channel" ADD "customFieldsTenantid" integer`, undefined);
        await queryRunner.query(`ALTER TABLE "channel" ADD "customFieldsErpchannelid" character varying(255)`, undefined);
        await queryRunner.query(`ALTER TABLE "channel" ADD CONSTRAINT "UQ_76786fa28248590e866126748d3" UNIQUE ("customFieldsErpchannelid")`, undefined);
        await queryRunner.query(`ALTER TABLE "administrator" ADD CONSTRAINT "FK_6609ec1efe43e247ba80f441e64" FOREIGN KEY ("customFieldsTenantid") REFERENCES "tenant"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`, undefined);
        await queryRunner.query(`ALTER TABLE "channel" ADD CONSTRAINT "FK_873abbcabcfd28773a1e5b40949" FOREIGN KEY ("customFieldsTenantid") REFERENCES "tenant"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`, undefined);
        await queryRunner.query(`ALTER TABLE "tenant" ADD CONSTRAINT "FK_20fc7aa992031ea6818102e48dd" FOREIGN KEY ("parentRoleId") REFERENCES "role"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`, undefined);
   }

   public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "tenant" DROP CONSTRAINT "FK_20fc7aa992031ea6818102e48dd"`, undefined);
        await queryRunner.query(`ALTER TABLE "channel" DROP CONSTRAINT "FK_873abbcabcfd28773a1e5b40949"`, undefined);
        await queryRunner.query(`ALTER TABLE "administrator" DROP CONSTRAINT "FK_6609ec1efe43e247ba80f441e64"`, undefined);
        await queryRunner.query(`ALTER TABLE "channel" DROP CONSTRAINT "UQ_76786fa28248590e866126748d3"`, undefined);
        await queryRunner.query(`ALTER TABLE "channel" DROP COLUMN "customFieldsErpchannelid"`, undefined);
        await queryRunner.query(`ALTER TABLE "channel" DROP COLUMN "customFieldsTenantid"`, undefined);
        await queryRunner.query(`COMMENT ON COLUMN "administrator"."customFields__fix_relational_custom_fields__" IS 'A work-around needed when only relational custom fields are defined on an entity'`, undefined);
        await queryRunner.query(`ALTER TABLE "administrator" DROP COLUMN "customFields__fix_relational_custom_fields__"`, undefined);
        await queryRunner.query(`ALTER TABLE "administrator" DROP COLUMN "customFieldsTenantid"`, undefined);
        await queryRunner.query(`DROP TABLE "tenant"`, undefined);
   }

}
