export declare function getAuth(): import("better-auth").Auth<import("better-auth").BetterAuthOptions>;
/** Lazy proxy so existing `auth.api.getSession(...)` calls work without changes */
export declare const auth: import("better-auth").Auth<import("better-auth").BetterAuthOptions>;
