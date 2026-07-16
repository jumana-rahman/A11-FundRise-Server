export declare const ac: {
    newRole<const TRoleStatements extends import("better-auth/plugins").Statements>(statements: import("better-auth/plugins").RoleInput<{
        readonly campaign: readonly ["create", "read", "update", "delete"];
        readonly contribution: readonly ["create", "read", "update", "delete"];
        readonly withdrawal: readonly ["create", "read", "update"];
        readonly notification: readonly ["read", "update", "delete"];
        readonly report: readonly ["create", "read", "update", "delete"];
        readonly user: readonly ["read", "update", "delete"];
        readonly payment: readonly ["create", "read"];
    }, TRoleStatements>): import("better-auth/plugins").Role<import("better-auth/plugins").ExactRoleStatements<TRoleStatements>, {
        readonly campaign: readonly ["create", "read", "update", "delete"];
        readonly contribution: readonly ["create", "read", "update", "delete"];
        readonly withdrawal: readonly ["create", "read", "update"];
        readonly notification: readonly ["read", "update", "delete"];
        readonly report: readonly ["create", "read", "update", "delete"];
        readonly user: readonly ["read", "update", "delete"];
        readonly payment: readonly ["create", "read"];
    }>;
    statements: {
        readonly campaign: readonly ["create", "read", "update", "delete"];
        readonly contribution: readonly ["create", "read", "update", "delete"];
        readonly withdrawal: readonly ["create", "read", "update"];
        readonly notification: readonly ["read", "update", "delete"];
        readonly report: readonly ["create", "read", "update", "delete"];
        readonly user: readonly ["read", "update", "delete"];
        readonly payment: readonly ["create", "read"];
    };
};
export declare const supporter: import("better-auth/plugins").Role<import("better-auth/plugins").ExactRoleStatements<{
    readonly campaign: ["read"];
    readonly contribution: ["create", "read"];
    readonly withdrawal: ["read"];
    readonly notification: ["read", "update"];
    readonly report: ["create", "read"];
    readonly payment: ["create", "read"];
}>, {
    readonly campaign: readonly ["create", "read", "update", "delete"];
    readonly contribution: readonly ["create", "read", "update", "delete"];
    readonly withdrawal: readonly ["create", "read", "update"];
    readonly notification: readonly ["read", "update", "delete"];
    readonly report: readonly ["create", "read", "update", "delete"];
    readonly user: readonly ["read", "update", "delete"];
    readonly payment: readonly ["create", "read"];
}>;
export declare const creator: import("better-auth/plugins").Role<import("better-auth/plugins").ExactRoleStatements<{
    readonly campaign: ["create", "read", "update", "delete"];
    readonly contribution: ["read", "update"];
    readonly withdrawal: ["create", "read"];
    readonly notification: ["read", "update"];
    readonly report: ["read"];
    readonly payment: ["read"];
}>, {
    readonly campaign: readonly ["create", "read", "update", "delete"];
    readonly contribution: readonly ["create", "read", "update", "delete"];
    readonly withdrawal: readonly ["create", "read", "update"];
    readonly notification: readonly ["read", "update", "delete"];
    readonly report: readonly ["create", "read", "update", "delete"];
    readonly user: readonly ["read", "update", "delete"];
    readonly payment: readonly ["create", "read"];
}>;
export declare const admin: import("better-auth/plugins").Role<import("better-auth/plugins").ExactRoleStatements<{
    readonly campaign: ["create", "read", "update", "delete"];
    readonly contribution: ["read", "update", "delete"];
    readonly withdrawal: ["read", "update"];
    readonly notification: ["read", "update", "delete"];
    readonly report: ["read", "update", "delete"];
    readonly user: ["read", "update", "delete"];
    readonly payment: ["read"];
}>, {
    readonly campaign: readonly ["create", "read", "update", "delete"];
    readonly contribution: readonly ["create", "read", "update", "delete"];
    readonly withdrawal: readonly ["create", "read", "update"];
    readonly notification: readonly ["read", "update", "delete"];
    readonly report: readonly ["create", "read", "update", "delete"];
    readonly user: readonly ["read", "update", "delete"];
    readonly payment: readonly ["create", "read"];
}>;
