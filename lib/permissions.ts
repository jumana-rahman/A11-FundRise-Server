import { createAccessControl } from "better-auth/plugins/access";

const statement = {
  campaign: ["create", "read", "update", "delete"],
  contribution: ["create", "read", "update", "delete"],
  withdrawal: ["create", "read", "update"],
  notification: ["read", "update", "delete"],
  report: ["create", "read", "update", "delete"],
  user: ["read", "update", "delete"],
  payment: ["create", "read"],
} as const;

export const ac = createAccessControl(statement);

export const supporter = ac.newRole({
  campaign: ["read"],
  contribution: ["create", "read"],
  withdrawal: ["read"],
  notification: ["read", "update"],
  report: ["create", "read"],
  payment: ["create", "read"],
});

export const creator = ac.newRole({
  campaign: ["create", "read", "update", "delete"],
  contribution: ["read", "update"],
  withdrawal: ["create", "read"],
  notification: ["read", "update"],
  report: ["read"],
  payment: ["read"],
});

export const admin = ac.newRole({
  campaign: ["create", "read", "update", "delete"],
  contribution: ["read", "update", "delete"],
  withdrawal: ["read", "update"],
  notification: ["read", "update", "delete"],
  report: ["read", "update", "delete"],
  user: ["read", "update", "delete"],
  payment: ["read"],
});
