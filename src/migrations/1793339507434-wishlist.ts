import {MigrationInterface, QueryRunner} from "typeorm";

export class Wishlist1793339507434 implements MigrationInterface {

   public async up(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`CREATE TABLE "wishlist_item" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" SERIAL NOT NULL, "productId" integer NOT NULL, CONSTRAINT "PK_dc473007d691690801365193b72" PRIMARY KEY ("id"))`, undefined);
        await queryRunner.query(`CREATE TABLE "customer_custom_fields_wishlist_items_wishlist_item" ("customerId" integer NOT NULL, "wishlistItemId" integer NOT NULL, CONSTRAINT "PK_4af1669d1b1030090802af4a306" PRIMARY KEY ("customerId", "wishlistItemId"))`, undefined);
        await queryRunner.query(`CREATE INDEX "IDX_fdea430617ba0dd9175210a297" ON "customer_custom_fields_wishlist_items_wishlist_item" ("customerId") `, undefined);
        await queryRunner.query(`CREATE INDEX "IDX_8a628531d6fda92f9667e316a9" ON "customer_custom_fields_wishlist_items_wishlist_item" ("wishlistItemId") `, undefined);
        await queryRunner.query(`ALTER TABLE "wishlist_item" ADD CONSTRAINT "FK_3318c9b2fa01dd1e9d05dbb4875" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`, undefined);
        await queryRunner.query(`ALTER TABLE "customer_custom_fields_wishlist_items_wishlist_item" ADD CONSTRAINT "FK_fdea430617ba0dd9175210a2976" FOREIGN KEY ("customerId") REFERENCES "customer"("id") ON DELETE CASCADE ON UPDATE CASCADE`, undefined);
        await queryRunner.query(`ALTER TABLE "customer_custom_fields_wishlist_items_wishlist_item" ADD CONSTRAINT "FK_8a628531d6fda92f9667e316a91" FOREIGN KEY ("wishlistItemId") REFERENCES "wishlist_item"("id") ON DELETE CASCADE ON UPDATE CASCADE`, undefined);
   }

   public async down(queryRunner: QueryRunner): Promise<any> {
        await queryRunner.query(`ALTER TABLE "customer_custom_fields_wishlist_items_wishlist_item" DROP CONSTRAINT "FK_8a628531d6fda92f9667e316a91"`, undefined);
        await queryRunner.query(`ALTER TABLE "customer_custom_fields_wishlist_items_wishlist_item" DROP CONSTRAINT "FK_fdea430617ba0dd9175210a2976"`, undefined);
        await queryRunner.query(`ALTER TABLE "wishlist_item" DROP CONSTRAINT "FK_3318c9b2fa01dd1e9d05dbb4875"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_8a628531d6fda92f9667e316a9"`, undefined);
        await queryRunner.query(`DROP INDEX "public"."IDX_fdea430617ba0dd9175210a297"`, undefined);
        await queryRunner.query(`DROP TABLE "customer_custom_fields_wishlist_items_wishlist_item"`, undefined);
        await queryRunner.query(`DROP TABLE "wishlist_item"`, undefined);
   }

}
