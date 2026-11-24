import { AuthenticationStrategy } from '@vendure/core';
import { DocumentNode } from 'graphql';
import gql from 'graphql-tag';

import { ZITADEL_STRATEGY_NAME } from './constants';

export interface ZitadelAuthData {
    token?: string;
}

/**
 * The strategy name recorded on the sessions and external sign-in records of admins who sign in through ZITADEL.
 * Sign-in itself goes through the REST routes (api/zitadel-auth.controller.ts), so the `authenticate` mutation is refused.
 */
export class ZitadelAuthenticationStrategy implements AuthenticationStrategy<ZitadelAuthData> {
    readonly name = ZITADEL_STRATEGY_NAME;

    defineInputType(): DocumentNode {
        return gql`
            input ZitadelAuthInput {
                token: String
            }
        `;
    }

    async authenticate(): Promise<false> {
        return false;
    }
}
