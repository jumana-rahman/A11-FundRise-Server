import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { admin, customSession } from "better-auth/plugins";
import { MongoClient, ObjectId } from "mongodb";
import { ac, supporter, creator, admin as adminRole } from "./permissions";

const client = new MongoClient(process.env.MONGODB_URI!);

const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

export const auth = betterAuth({
  trustedOrigins: [CLIENT_URL],
  database: mongodbAdapter(client.db()),
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
});
