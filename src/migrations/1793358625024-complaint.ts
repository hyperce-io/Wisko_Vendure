import {MigrationInterface, QueryRunner} from "typeorm";

export class Complaint1793358625024 implements MigrationInterface {

   public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`CREATE TABLE "complaint" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "issueType" character varying NOT NULL, "description" text NOT NULL, "status" character varying NOT NULL DEFAULT 'OPEN', "adminNote" text, "id" SERIAL NOT NULL, "customerId" integer, "orderId" integer, "imageId" integer, CONSTRAINT "PK_a9c8dbc2ab4988edcc2ff0a7337" PRIMARY KEY ("id"))`, undefined);
        await queryRunner.query(`ALTER TABLE "complaint" ADD CONSTRAINT "FK_f714c71743dcd19f15876136713" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`, undefined);
        await queryRunner.query(`ALTER TABLE "complaint" ADD CONSTRAINT "FK_8d4fee66470655872122ee1d609" FOREIGN KEY ("orderId") REFERENCES "order"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`, undefined);
        await queryRunner.query(`ALTER TABLE "complaint" ADD CONSTRAINT "FK_014f6b049f6da66262788dd0559" FOREIGN KEY ("imageId") REFERENCES "asset"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`, undefined);
   }

   public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "complaint" DROP CONSTRAINT "FK_014f6b049f6da66262788dd0559"`, undefined);
        await queryRunner.query(`ALTER TABLE "complaint" DROP CONSTRAINT "FK_8d4fee66470655872122ee1d609"`, undefined);
        await queryRunner.query(`ALTER TABLE "complaint" DROP CONSTRAINT "FK_f714c71743dcd19f15876136713"`, undefined);
        await queryRunner.query(`DROP TABLE "complaint"`, undefined);
   }

}
