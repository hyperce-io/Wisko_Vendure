import {MigrationInterface, QueryRunner} from "typeorm";

export class True1795013318445 implements MigrationInterface {

   public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "channel" ADD "customFieldsBirthdaydiscountpercent" integer`, undefined);
   }

   public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "channel" DROP COLUMN "customFieldsBirthdaydiscountpercent"`, undefined);
   }

}
