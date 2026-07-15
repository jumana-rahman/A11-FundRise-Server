import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { admin, customSession } from "better-auth/plugins";
import { MongoClient } from "mongodb";
import { ac, supporter, creator, admin as adminRole } from "./permissions";

const client = new MongoClient(process.env.MONGODB_URI!);

export const auth = betterAuth({
  database: mongodbAdapter(client.db(), {
    collectionMapping: {
      user: "users",
      session: "sessions",
      account: "accounts",
      verification: "verifications",
    },
  }),
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
      const fullUser = await db.collection("users").findOne({ _id: user.id });
      return {
        user: {
          ...user,
          credits: fullUser?.credits ?? 0,
          photoUrl: fullUser?.photoUrl ?? "",
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
        required: true,
        default: 0,
      },
      photoUrl: {
        type: "string",
        required: false,
        default: "",
      },
      role: {
        type: "string",
        required: true,
        default: "supporter",
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
});
