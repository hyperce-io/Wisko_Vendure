import { Body, Controller, Get, Inject, Post, Query, Req, Res } from '@nestjs/common';
import {
    AuthService,
    ConfigService,
    Ctx,
    isGraphQlErrorResult,
    Logger,
    RequestContext,
    SessionService,
    setSessionToken,
    UserService,
} from '@vendure/core';
import type { Request, Response } from 'express';

import {
    ERROR_QUERY,
    loggerCtx,
    NO_ACCESS_ERROR,
    PENDING_SIGN_IN_MS,
    SIGN_IN_FAILED_ERROR,
    SIGNED_OUT_QUERY,
    WISKO_AUTH_PATH,
    ZITADEL_PLUGIN_OPTIONS,
    ZITADEL_STRATEGY_NAME,
} from '../constants';
import { authorizeUrl, endSessionUrl, finishSignIn, InvalidToken, SignInRefused, startSignIn, verifiedLogout } from '../oidc';
import { ZitadelSignInService } from '../services/zitadel-sign-in.service';
import { ZitadelPluginOptions } from '../types';

@Controller(WISKO_AUTH_PATH)
export class ZitadelAuthController {
    constructor(
        @Inject(ZITADEL_PLUGIN_OPTIONS) private options: ZitadelPluginOptions,
        private signInService: ZitadelSignInService,
        private authService: AuthService,
        private configService: ConfigService,
        private sessionService: SessionService,
        private userService: UserService,
    ) {}

    @Get('login')
    login(@Req() req: Request, @Res() res: Response, @Query('returnTo') returnTo?: string) {
        if (!req.session) return res.redirect(this.dashboardLoginUrl({ [ERROR_QUERY]: SIGN_IN_FAILED_ERROR }));
        if (req.session.wiskoSignedIn && req.session.token === '') {
            req.session.wiskoSignedIn = null;
            return res.redirect(endSessionUrl(this.options, this.dashboardLoginUrl({ [SIGNED_OUT_QUERY]: '1' })));
        }
        const pendingSignIn = startSignIn(this.dashboardReturnPath(returnTo));
        req.session.wiskoPendingSignIn = pendingSignIn;
        return res.redirect(authorizeUrl(this.options, this.callbackUrl(), pendingSignIn));
    }

    @Get('callback')
    async callback(
        @Ctx() ctx: RequestContext,
        @Req() req: Request,
        @Res() res: Response,
        @Query('code') code?: string,
        @Query('state') state?: string,
    ) {
        const pendingSignIn = req.session?.wiskoPendingSignIn;
        if (!req.session || !pendingSignIn || Date.now() - pendingSignIn.startedAt > PENDING_SIGN_IN_MS) {
            return res.redirect(this.dashboardLoginUrl({ [ERROR_QUERY]: SIGN_IN_FAILED_ERROR }));
        }
        req.session.wiskoPendingSignIn = null;
        if (state !== pendingSignIn.state) {
            return res.redirect(`/${WISKO_AUTH_PATH}/login?${new URLSearchParams({ returnTo: pendingSignIn.returnTo })}`);
        }
        if (!code) return res.redirect(this.dashboardLoginUrl({ [ERROR_QUERY]: SIGN_IN_FAILED_ERROR }));

        try {
            const identity = await finishSignIn(this.options, this.callbackUrl(), pendingSignIn, code);
            if (identity.signedInAt.getTime() + this.options.sessionHours * 3600_000 <= Date.now()) {
                return res.redirect(endSessionUrl(this.options, this.dashboardLoginUrl({ [SIGNED_OUT_QUERY]: '1' })));
            }
            const user = await this.signInService.findAdminUser(identity);
            const session = await this.authService.createAuthenticatedSessionForUser(ctx, user, ZITADEL_STRATEGY_NAME, 'admin');
            if (isGraphQlErrorResult(session)) throw new Error(session.message);
            setSessionToken({
                sessionToken: session.token,
                rememberMe: false,
                authOptions: this.configService.authOptions,
                req,
                res,
            });
            req.session.wiskoSignedIn = true;
            Logger.info(`${identity.email} signed in through ZITADEL`, loggerCtx);
            return res.redirect(`${this.options.vendureUrl}${pendingSignIn.returnTo}`);
        } catch (error) {
            if (error instanceof SignInRefused) {
                Logger.info(`Sign-in refused: ${error.message}`, loggerCtx);
                return res.redirect(this.dashboardLoginUrl({ [ERROR_QUERY]: NO_ACCESS_ERROR }));
            }
            Logger.error(`Sign-in failed: ${error instanceof Error ? error.message : String(error)}`, loggerCtx);
            return res.redirect(this.dashboardLoginUrl({ [ERROR_QUERY]: SIGN_IN_FAILED_ERROR }));
        }
    }

    @Get('logout')
    async logout(@Ctx() ctx: RequestContext, @Req() req: Request, @Res() res: Response) {
        const user = ctx.activeUserId ? await this.userService.getUserById(ctx, ctx.activeUserId) : undefined;
        if (user) await this.sessionService.deleteSessionsByUser(ctx, user);
        setSessionToken({ sessionToken: '', rememberMe: false, authOptions: this.configService.authOptions, req, res });
        if (req.session) req.session.wiskoSignedIn = null;
        return res.redirect(endSessionUrl(this.options, this.dashboardLoginUrl({ [SIGNED_OUT_QUERY]: '1' })));
    }

    @Post('backchannel-logout')
    async backchannelLogout(@Body('logout_token') logoutToken: unknown, @Res() res: Response) {
        if (typeof logoutToken !== 'string') return res.status(400).end();
        try {
            const { zitadelUserId } = await verifiedLogout(this.options, logoutToken);
            const hasEnded = await this.signInService.endSessions(zitadelUserId);
            Logger.info(`Back-channel logout of ${zitadelUserId}: ${hasEnded ? 'Store sessions ended' : 'no Store admin'}`, loggerCtx);
            return res.status(200).end();
        } catch (error) {
            if (!(error instanceof InvalidToken)) throw error;
            Logger.warn(`Back-channel logout refused: ${error.message}`, loggerCtx);
            return res.status(400).end();
        }
    }

    private callbackUrl(): string {
        return `${this.options.vendureUrl}/${WISKO_AUTH_PATH}/callback`;
    }

    private dashboardLoginUrl(query: Record<string, string>): string {
        return `${this.options.vendureUrl}${this.options.dashboardPath}/login?${new URLSearchParams(query)}`;
    }

    private dashboardReturnPath(returnTo: string | undefined): string {
        const { dashboardPath } = this.options;
        const isDashboardPath = returnTo === dashboardPath || Boolean(returnTo?.startsWith(`${dashboardPath}/`));
        return returnTo && isDashboardPath && !returnTo.includes('//') ? returnTo : `${dashboardPath}/`;
    }
}
