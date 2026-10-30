# Wishlist — Frontend (Next.js) integration

Lets a **logged-in customer** save products to a personal wishlist, list them, remove them, and
show a filled/empty "heart" on any product. Wishlist entries are **product-level** (not per
variant).

## Always use the default channel

Call the Shop API on the **default channel** — **do not send a `vendure-token` header**, so
requests resolve against the default (marketplace) channel where the customer's account lives.

## Requires an authenticated customer

Every wishlist query/mutation is `Owner`-guarded — the customer must be **logged in**. Send the
session so the server knows who the customer is: use `credentials: 'include'` (cookie session) or,
if you use bearer tokens, send `Authorization: Bearer <vendure-auth-token>`. Un-authenticated
calls return empty/forbidden, and `Product.isInWishlist` is simply `false`.

## Shop API client (Next.js)

```ts
// lib/shop.ts
const SHOP_API = process.env.NEXT_PUBLIC_SHOP_API_URL!; // http://localhost:3000/shop-api

export async function shopFetch<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(SHOP_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" }, // no channel token → default channel
    credentials: "include", // sends the customer session cookie
    cache: "no-store",
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0].message);
  return json.data as T;
}
```

## What the Shop API exposes

**Query** — a standard Vendure **paginated list** (`WishlistItemList`) taking `WishlistItemListOptions`
(`skip`, `take`, `sort`, `filter`):

```graphql
query ActiveCustomerWishlist($options: WishlistItemListOptions) {
  activeCustomerWishlist(options: $options) {
    totalItems
    items {
      id
      productId
      product {
        id
        name
        slug
        featuredAsset {
          preview
        }
      }
    }
  }
}
```

```jsonc
// variables — newest first, 20 per page
{ "options": { "skip": 0, "take": 20, "sort": { "createdAt": "DESC" } } }
```

`totalItems` is the full wishlist count (for page controls); `items` is the requested page.
`sort` and `filter` accept `id`, `createdAt`, `updatedAt` and `productId`. Omitting `take` returns
up to Vendure's shop list limit (100 by default), so pass `take` for wishlists that may be longer.

**Mutations**

```graphql
mutation AddToWishlist($productId: ID!) {
  addToWishlist(productId: $productId) {
    # returns the full updated list
    id
    productId
    product {
      id
      name
      slug
    }
  }
}

mutation RemoveFromWishlist($productId: ID!) {
  removeFromWishlist(productId: $productId) {
    success
    message
    items {
      id
      productId
    }
  }
}
```

**Extra fields on `Product`** (request them wherever you already query products):

```graphql
query Product($slug: String!) {
  product(slug: $slug) {
    id
    name
    isInWishlist # Boolean! — is this product in the current customer's wishlist
    wishListId # ID — the wishlist item id (null if not wishlisted)
  }
}
```

## What the frontend can do

- **Show wishlist state** on product cards / detail pages via `Product.isInWishlist`.
- **Toggle**: call `addToWishlist(productId)` / `removeFromWishlist(productId)` — both keyed by
  `productId` (no need to track the wishlist-item id, though `wishListId` is available).
- **Render a wishlist page** from `activeCustomerWishlist` (each item includes its `product`).
- **Optimistic UI**: `addToWishlist` returns the full updated list and is idempotent (adding an
  already-wishlisted product is a no-op); `removeFromWishlist` returns `{ success, message, items }`.

## Example — toggle button (client component)

```tsx
// components/WishlistButton.tsx
"use client";
import { useState } from "react";
import { shopFetch } from "@/lib/shop";

const ADD = /* graphql */ `mutation($id: ID!){ addToWishlist(productId: $id){ id } }`;
const REMOVE = /* graphql */ `mutation($id: ID!){ removeFromWishlist(productId: $id){ success } }`;

export function WishlistButton({
  productId,
  initialIn,
}: {
  productId: string;
  initialIn: boolean;
}) {
  const [inList, setInList] = useState(initialIn);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const next = !inList;
    setInList(next); // optimistic
    try {
      await shopFetch(next ? ADD : REMOVE, { id: productId });
    } catch {
      setInList(!next); // revert on error (e.g. not logged in)
    } finally {
      setBusy(false);
    }
  }

  return (
    <button onClick={toggle} disabled={busy} aria-pressed={inList}>
      {inList ? "♥ In wishlist" : "♡ Add to wishlist"}
    </button>
  );
}
```

Pass `initialIn={product.isInWishlist}` from the product query so the heart renders correctly on
first paint.

## Example — wishlist page (App Router)

```tsx
// app/account/wishlist/page.tsx
import { shopFetch } from "@/lib/shop";

const QUERY = /* graphql */ `
  query ($options: WishlistItemListOptions) {
    activeCustomerWishlist(options: $options) {
      totalItems
      items { id productId product { name slug featuredAsset { preview } } }
    }
  }
`;

export default async function WishlistPage() {
  const { activeCustomerWishlist } = await shopFetch<{
    activeCustomerWishlist: { totalItems: number; items: any[] };
  }>(QUERY, { options: { skip: 0, take: 20 } });
  const { items, totalItems } = activeCustomerWishlist;
  if (!totalItems) return <p>Your wishlist is empty.</p>;
  return (
    <ul>
      {items.map((i) => (
        <li key={i.id}>
          <a href={`/product/${i.product.slug}`}>
            <img src={i.product.featuredAsset?.preview} alt={i.product.name} />
            {i.product.name}
          </a>
        </li>
      ))}
    </ul>
  );
}
```

## Notes / limits

- **Login required** — gate the wishlist UI behind an authenticated customer; show a "sign in to
  save" prompt otherwise.
- **Product-level only** — you wishlist a product, not a specific variant (size/colour). Link the
  card to the product page; let the customer pick a variant there.
- Amounts/pricing aren't part of wishlist data — fetch price fields from the `product`/`variants`
  as usual if you want to show them on the wishlist page.
