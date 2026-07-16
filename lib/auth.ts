import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { admin, customSession } from "better-auth/plugins";
import { ObjectId } from "mongodb";
import { ac, supporter, creator, admin as adminRole } from "./permissions";
import { getClient } from "./db";

const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

let _auth: ReturnType<typeof betterAuth> | null = null;

export function getAuth() {
  if (_auth) return _auth;

  const client = getClient();

  _auth = betterAuth({
    trustedOrigins: [CLIENT_URL],
    database: mongodbAdapter(client.db("fundrise")),
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
    },
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      },
    },
    plugins: [
      admin({
        defaultRole: "supporter",
        adminRole: "admin",
        ac,
        roles: {
          supporter,
          creator,
          admin: adminRole,
        },
      }),
      customSession(async ({ user, session }) => {
        const db = client.db();
        let fullUser;
        try {
          fullUser = await db.collection("user").findOne({ _id: new ObjectId(user.id) });
        } catch {
          fullUser = await db.collection("user").findOne({ email: user.email });
        }
        return {
          user: {
            ...user,
            credits: fullUser?.credits ?? 0,
            photoUrl: fullUser?.photoUrl || fullUser?.image || (user as any).image || "",
            role: fullUser?.role ?? "supporter",
          },
          session,
        };
      }),
    ],
    user: {
      additionalFields: {
        credits: {
          type: "number",
          required: false,
          default: 0,
        },
        photoUrl: {
          type: "string",
          required: false,
          default: "",
        },
        role: {
          type: "string",
          required: false,
          default: "supporter",
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
  } as any);

  return _auth;
}

/** Lazy proxy so existing `auth.api.getSession(...)` calls work without changes */
export const auth = new Proxy({} as ReturnType<typeof betterAuth>, {
  get(_target, prop, receiver) {
    const instance = getAuth() as any;
    const value = Reflect.get(instance, prop, receiver);
    if (typeof value === "function") {
      return value.bind(instance);
    }
    return value;
  },
});
