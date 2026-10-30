import { CollectionService } from '@vendure/core';

import { FaqTargetTypeDefinition } from '../faq-target-types';

export const COLLECTION_TARGET_CODE = 'collection';

export const collectionFaqTarget: FaqTargetTypeDefinition = {
    code: COLLECTION_TARGET_CODE,
    label: 'Collection',
    async validate(ctx, injector, targetKey) {
        const collectionService = injector.get(CollectionService);
        const collection = await collectionService.findOne(ctx, targetKey);
        return !!collection;
    },
    async resolveDisplay(ctx, injector, targetKey) {
        const collectionService = injector.get(CollectionService);
        const collection = await collectionService.findOne(ctx, targetKey);
        if (!collection) return null;
        return { label: collection.name, url: `/collections/${collection.slug}` };
    },
};
