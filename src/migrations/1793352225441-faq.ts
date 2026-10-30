import {MigrationInterface, QueryRunner} from "typeorm";
import { deduplicateTranslations } from "@vendure/core";

export class Faq1793352225441 implements MigrationInterface {

   public async up(queryRunner: QueryRunner): Promise<any> {
        // Remove any duplicate (baseId, languageCode) translation rows left over from before the
        // unique constraint existed, keeping the most recently updated row of each pair. This must
        // run before the constraint is created below. See https://github.com/vendurehq/vendure/issues/4884
        await deduplicateTranslations(queryRunner, ["faq_translation"]);
        await queryRunner.query(`CREATE TABLE "faq_translation" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "languageCode" character varying NOT NULL, "question" character varying NOT NULL, "answer" character varying NOT NULL, "id" SERIAL NOT NULL, "baseId" integer, CONSTRAINT "UQ_5b5d13198916542567721349094" UNIQUE ("languageCode", "baseId"), CONSTRAINT "PK_060979bc2b64572b16d84acbf9a" PRIMARY KEY ("id"))`, undefined);
        await queryRunner.query(`CREATE INDEX "IDX_a8b00b63dffd4c41f78f749c9a" ON "faq_translation" ("baseId") `, undefined);
        await queryRunner.query(`CREATE TABLE "faq" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP, "enabled" boolean NOT NULL, "id" SERIAL NOT NULL, CONSTRAINT "PK_d6f5a52b1a96dd8d0591f9fbc47" PRIMARY KEY ("id"))`, undefined);
        await queryRunner.query(`CREATE TABLE "faq_assignment" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "targetType" character varying NOT NULL, "targetKey" character varying NOT NULL, "position" integer NOT NULL DEFAULT '0', "enabled" boolean NOT NULL DEFAULT true, "id" SERIAL NOT NULL, "faqId" integer, CONSTRAINT "UQ_faq_assignment_faq_target" UNIQUE ("faqId", "targetType", "targetKey"), CONSTRAINT "PK_fd7b2b08e0b6fc56d5cf7833ed5" PRIMARY KEY ("id"))`, undefined);
        await queryRunner.query(`CREATE INDEX "IDX_4176d8ac4b9496c3d6558b5275" ON "faq_assignment" ("faqId") `, undefined);
        await queryRunner.query(`CREATE INDEX "IDX_faq_assignment_target_lookup" ON "faq_assignment" ("targetType", "targetKey", "enabled") `, undefined);
        await queryRunner.query(`CREATE TABLE "faq_channels_channel" ("faqId" integer NOT NULL, "channelId" integer NOT NULL, CONSTRAINT "PK_dacd6f9dcadae1c2d2da6d4e649" PRIMARY KEY ("faqId", "channelId"))`, undefined);
        await queryRunner.query(`CREATE INDEX "IDX_a0b2fe181cb96fc478b5246616" ON "faq_channels_channel" ("faqId") `, undefined);
        await queryRunner.query(`CREATE INDEX "IDX_9561075b6bda7c3f8be1c8fc83" ON "faq_channels_channel" ("channelId") `, undefined);
        await queryRunner.query(`ALTER TABLE "faq_translation" ADD CONSTRAINT "FK_a8b00b63dffd4c41f78f749c9a0" FOREIGN KEY ("baseId") REFERENCES "faq"("id") ON DELETE CASCADE ON UPDATE NO ACTION`, undefined);
        await queryRunner.query(`ALTER TABLE "faq_assignment" ADD CONSTRAINT "FK_4176d8ac4b9496c3d6558b52756" FOREIGN KEY ("faqId") REFERENCES "faq"("id") ON DELETE CASCADE ON UPDATE NO ACTION`, undefined);
        await queryRunner.query(`ALTER TABLE "faq_channels_channel" ADD CONSTRAINT "FK_a0b2fe181cb96fc478b5246616a" FOREIGN KEY ("faqId") REFERENCES "faq"("id") ON DELETE CASCADE ON UPDATE CASCADE`, undefined);
        await queryRunner.query(`ALTER TABLE "faq_channels_channel" ADD CONSTRAINT "FK_9561075b6bda7c3f8be1c8fc833" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE CASCADE`, undefined);
   }

   public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "faq_channels_channel" DROP CONSTRAINT "FK_9561075b6bda7c3f8be1c8fc833"`, undefined);
        await queryRunner.query(`ALTER TABLE "faq_channels_channel" DROP CONSTRAINT "FK_a0b2fe181cb96fc478b5246616a"`, undefined);
        await queryRunner.query(`ALTER TABLE "faq_assignment" DROP CONSTRAINT "FK_4176d8ac4b9496c3d6558b52756"`, undefined);
        await queryRunner.query(`ALTER TABLE "faq_translation" DROP CONSTRAINT "FK_a8b00b63dffd4c41f78f749c9a0"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_9561075b6bda7c3f8be1c8fc83"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_a0b2fe181cb96fc478b5246616"`, undefined);
        await queryRunner.query(`DROP TABLE "faq_channels_channel"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_faq_assignment_target_lookup"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_4176d8ac4b9496c3d6558b5275"`, undefined);
        await queryRunner.query(`DROP TABLE "faq_assignment"`, undefined);
        await queryRunner.query(`DROP TABLE "faq"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_a8b00b63dffd4c41f78f749c9a"`, undefined);
        await queryRunner.query(`DROP TABLE "faq_translation"`, undefined);
   }

}
