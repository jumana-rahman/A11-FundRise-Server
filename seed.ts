// ═══════════════════════════════════════════════════════════════════════════════
// FundRise Database Seed Script
// ═══════════════════════════════════════════════════════════════════════════════
//
// WHAT THIS SCRIPT DOES:
//   This script seeds your MongoDB database with realistic test data by calling
//   the server's API endpoints. It creates users, campaigns, contributions,
//   payments, withdrawals, reports, and notifications — simulating real usage.
//
// PREREQUISITES:
//   1. Server must be running on http://localhost:5000
//      Run: npx tsx index.ts   (from fundrise-server/)
//   2. MongoDB Atlas must be connected (check MONGODB_URI in .env)
//   3. Run from fundrise-server/: npx tsx seed.ts
//
// WHAT GETS INSERTED:
//   ┌─────────────────────┬────────┬──────────────────────────────────────────┐
//   │ Collection           │ Count  │ Description                              │
//   ├─────────────────────┼────────┼──────────────────────────────────────────┤
//   │ user                 │ 4      │ 2 supporters, 1 creator, 1 admin         │
//   │ session              │ 4      │ better-auth session tokens                │
//   │ account              │ 0      │ (OAuth accounts — none created)          │
//   │ campaigns            │ 6      │ Across 6 categories, all approved         │
//   │ contributions        │ 5      │ 4 approved, 1 rejected (with refund)     │
//   │ payments             │ 2      │ Simulated Stripe credit purchases        │
//   │ withdrawals          │ 2      │ Both approved by admin                    │
//   │ notifications        │ ~17    │ Auto-created by contributions/approvals  │
//   │ reports              │ 2      │ Flagged campaigns by supporters           │
//   └─────────────────────┴────────┴──────────────────────────────────────────┘
//
// LOGIN CREDENTIALS AFTER SEED:
//   ┌──────────┬──────────────────────┬─────────────┐
//   │ Role     │ Email                │ Password    │
//   ├──────────┼──────────────────────┼─────────────┤
//   │ Supporter│ sarah@test.com       │ Pass1234!   │
//   │ Supporter│ jamie@test.com       │ Pass1234!   │
//   │ Creator  │ alex@test.com        │ Pass1234!   │
//   │ Admin    │ admin@fundrise.com   │ Admin@1234! │
//   └──────────┴──────────────────────┴─────────────┘
//
// HOW TO RUN:
//   1. cd fundrise-server
//   2. npx tsx seed.ts
//   3. Check console output for ✅ / ❌ on each step
//
// TO RE-SEED (fresh start):
//   The script does NOT delete old data. To clear first:
//   - Manually drop collections in MongoDB Atlas, OR
//   - Use MongoDB Compass to delete documents
//   - Then re-run: npx tsx seed.ts
//
// NOTE: If users already exist, registration will fail (better-auth rejects
//   duplicate emails). The rest of the seed will skip those steps.
// ═══════════════════════════════════════════════════════════════════════════════

import "dotenv/config";
import http from "node:http";

// ─── Configuration ──────────────────────────────────────────────────────────
// Base URL of the running server. All API requests go here.
const BASE = "http://localhost:5000";

// ═══════════════════════════════════════════════════════════════════════════════
// HTTP CLIENT HELPER
// ═══════════════════════════════════════════════════════════════════════════════
//
// better-auth uses session cookies for authentication. Each user needs their
// own cookie jar to maintain separate sessions. The HttpClient class handles:
//   - Sending HTTP requests (GET, POST, PATCH, DELETE)
//   - Automatically storing and sending cookies from Set-Cookie headers
//   - Parsing JSON responses
//   - Attaching Authorization: Bearer <JWT> headers when needed

interface CookieJar {
  [key: string]: string;
}

/**
 * Parse Set-Cookie response headers into a cookie name→value map.
 * Example: "better-auth.session_token=abc123; Max-Age=604800; Path=/"
 *   → { "better-auth.session_token": "abc123" }
 */
function parseCookies(setCookieHeaders: string[]): CookieJar {
  const jar: CookieJar = {};
  for (const header of setCookieHeaders) {
    // Split on first ";" to get "name=value" pair
    const [pair] = header.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) {
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      jar[name] = value;
    }
  }
  return jar;
}

/**
 * Convert a cookie jar object into a Cookie header string.
 * Example: { "token": "abc", "session": "xyz" } → "token=abc; session=xyz"
 */
function cookieString(jar: CookieJar): string {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

/**
 * HTTP client that automatically manages cookies.
 * Each user (supporter, creator, admin) should get their own HttpClient
 * instance so they have independent session cookies.
 */
class HttpClient {
  private cookies: CookieJar = {};

  async request(
    method: string,
    path: string,
    body?: any,
    extraHeaders?: Record<string, string>
  ): Promise<{ status: number; data: any; setCookies: string[] }> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, BASE);

      // Build request headers
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...extraHeaders,
      };

      // Attach stored cookies (better-auth session cookies)
      if (Object.keys(this.cookies).length > 0) {
        headers["Cookie"] = cookieString(this.cookies);
      }

      // Serialize body to JSON (GET/HEAD requests have no body)
      const payload = body ? JSON.stringify(body) : undefined;

      const opts: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers,
        timeout: 15000,
      };

      const req = http.request(opts, (res) => {
        let data = "";
        res.on("data", (c: Buffer) => (data += c));
        res.on("end", () => {
          // Store any new cookies from Set-Cookie headers
          const sc = res.headers["set-cookie"];
          if (sc) {
            const newCookies = parseCookies(sc);
            Object.assign(this.cookies, newCookies);
          }

          // Parse JSON response (fallback to raw text)
          let parsed: any;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }

          resolve({
            status: res.statusCode || 0,
            data: parsed,
            setCookies: Array.isArray(sc) ? sc : [],
          });
        });
      });

      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("TIMEOUT"));
      });

      if (payload) req.write(payload);
      req.end();
    });
  }

  // Convenience methods for different HTTP verbs
  get(path: string, headers?: Record<string, string>) {
    return this.request("GET", path, undefined, headers);
  }
  post(path: string, body?: any, headers?: Record<string, string>) {
    return this.request("POST", path, body, headers);
  }
  patch(path: string, body?: any, headers?: Record<string, string>) {
    return this.request("PATCH", path, body, headers);
  }
  put(path: string, body?: any, headers?: Record<string, string>) {
    return this.request("PUT", path, body, headers);
  }
  del(path: string, headers?: Record<string, string>) {
    return this.request("DELETE", path, undefined, headers);
  }
}

/**
 * Print a ✅ or ❌ status line for each API call in the seed.
 * Helps quickly identify which steps succeeded or failed.
 */
function ok(label: string, status: number, expected: number[]) {
  const pass = expected.includes(status);
  const icon = pass ? "\u2705" : "\u274c";
  console.log(
    `  ${icon} ${label}: ${status}${pass ? "" : ` (expected ${expected.join("|")})`}`
  );
  return pass;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEED DATA
// ═══════════════════════════════════════════════════════════════════════════════
//
// The main() function below seeds the database in this order:
//
//   Step 1:  Register 4 users via better-auth (creates auth accounts)
//   Step 2:  Assign roles & grant registration credits (50 for supporters, 20 for creators)
//   Step 3:  Generate JWT tokens for API access
//   Step 4:  Add extra purchase credits so supporters can make contributions
//   Step 5:  Create 6 campaigns (all in "pending" status initially)
//   Step 6:  Admin approves all campaigns (status → "approved")
//   Step 7:  Supporters contribute credits to campaigns
//   Step 8:  Creator reviews contributions (approve/reject)
//   Step 9:  Simulate credit purchases (record payment history)
//   Step 10: Creator requests withdrawal of earned credits
//   Step 11: Admin approves withdrawal requests
//   Step 12: Supporters report suspicious campaigns
//   Step 13: Verify notifications were auto-created
//   Step 14: Final verification — count all data
//
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log("=== FundRise Database Seed (TypeScript) ===\n");

  // ───────────────────────────────────────────────────────────────────────────
  // STEP 0: Health Check
  // ───────────────────────────────────────────────────────────────────────────
  // Verify the server is running and MongoDB is connected before proceeding.
  // If this fails, the server is not running — start it first with:
  //   npx tsx index.ts

  console.log("--- Step 0: Health Check ---");
  const health = await new HttpClient().get("/api/health");
  console.log(`  Server: ${health.data.status} | Database: ${health.data.database}`);
  if (health.data.database !== "connected") {
    console.error("  ERROR: MongoDB is not connected. Start the server first.");
    process.exit(1);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // STEP 1: Register Users
  // ───────────────────────────────────────────────────────────────────────────
  // Each user gets their own HttpClient to maintain separate session cookies.
  // Registration goes through better-auth's built-in sign-up endpoint:
  //   POST /api/auth/sign-up/email
  //
  // Fields sent:
  //   - name:     Display name shown in the UI
  //   - email:    Login email (must be unique)
  //   - password: Must meet better-auth's minimum requirements
  //   - image:    Profile photo URL (Unsplash in this case)
  //
  // After registration, better-auth auto-signs-in the user (autoSignIn: true)
  // and returns a session cookie. This cookie is stored in each HttpClient's
  // cookie jar for subsequent requests.

  console.log("\n--- Step 1: Registering Users ---");

  // Sarah Mitchell — active supporter who contributes to multiple campaigns
  const supporter = new HttpClient();
  const r1 = await supporter.post("/api/auth/sign-up/email", {
    name: "Sarah Mitchell",
    email: "sarah@test.com",
    password: "Pass1234!",
    image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop",
  });
  ok("Register supporter (Sarah)", r1.status, [200, 201]);

  // Alex Rivera — creator who launches campaigns and reviews contributions
  const creator = new HttpClient();
  const r2 = await creator.post("/api/auth/sign-up/email", {
    name: "Alex Rivera",
    email: "alex@test.com",
    password: "Pass1234!",
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop",
  });
  ok("Register creator (Alex)", r2.status, [200, 201]);

  // Admin User — platform administrator who approves campaigns & withdrawals
  const admin = new HttpClient();
  const r3 = await admin.post("/api/auth/sign-up/email", {
    name: "Admin User",
    email: "admin@fundrise.com",
    password: "Admin@1234!",
    image: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop",
  });
  ok("Register admin", r3.status, [200, 201]);

  // Jamie Chen — second supporter, contributes to different campaigns than Sarah
  const supporter2 = new HttpClient();
  const r4 = await supporter2.post("/api/auth/sign-up/email", {
    name: "Jamie Chen",
    email: "jamie@test.com",
    password: "Pass1234!",
    image: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop",
  });
  ok("Register supporter2 (Jamie)", r4.status, [200, 201]);

  // ───────────────────────────────────────────────────────────────────────────
  // STEP 2: Grant Registration Credits & Assign Roles
  // ───────────────────────────────────────────────────────────────────────────
  // After better-auth creates the user, we need to:
  //   1. Set the user's role (supporter/creator/admin)
  //   2. Grant initial credits (50 for supporters, 20 for creators)
  //
  // This is done via POST /api/auth/register-credits which:
  //   - Reads the session cookie to identify the user
  //   - Updates the user document in MongoDB with role + credits
  //
  // CREDIT SYSTEM:
  //   - 10 credits = $1 (for purchasing credits)
  //   - 20 credits = $1 (for creator withdrawals)
  //   - Supporters get 50 free credits on signup
  //   - Creators get 20 free credits on signup
  //   - Minimum contribution: varies per campaign (set by creator)
  //   - Minimum withdrawal: 200 credits

  console.log("\n--- Step 2: Granting Registration Credits & Roles ---");

  // Sarah gets 50 credits as a supporter (default role)
  const rc1 = await supporter.post("/api/auth/register-credits", { role: "supporter" });
  ok("Set role & credits for supporter (Sarah: 50 credits)", rc1.status, [200]);

  // Alex gets 20 credits as a creator
  const rc2 = await creator.post("/api/auth/register-credits", { role: "creator" });
  ok("Set role & credits for creator (Alex: 20 credits)", rc2.status, [200]);

  // Admin gets 20 credits (role: admin)
  const rc3 = await admin.post("/api/auth/register-credits", { role: "admin" });
  ok("Set role & credits for admin (Admin: 20 credits)", rc3.status, [200]);

  // Jamie gets 50 credits as a supporter
  const rc4 = await supporter2.post("/api/auth/register-credits", { role: "supporter" });
  ok("Set role & credits for supporter2 (Jamie: 50 credits)", rc4.status, [200]);

  // ───────────────────────────────────────────────────────────────────────────
  // STEP 3: Get JWT Tokens
  // ───────────────────────────────────────────────────────────────────────────
  // The server uses TWO auth layers:
  //   1. better-auth: Session cookies (created during sign-up/sign-in)
  //   2. Custom JWT: Used for Authorization: Bearer header on API routes
  //
  // The client flow is:
  //   1. Sign up/in via better-auth (creates session + cookie)
  //   2. Call POST /api/auth/jwt to get a custom JWT token
  //   3. Store JWT in localStorage
  //   4. Send JWT as Authorization: Bearer header on all API calls
  //
  // The JWT endpoint reads the better-auth session via cookies,
  // then generates a JWT with the user's id, email, name, role, credits.

  console.log("\n--- Step 3: Getting JWT Tokens ---");

  const jwt1 = await supporter.post("/api/auth/jwt");
  const supporterJWT = jwt1.data?.token;
  ok("JWT for supporter (Sarah)", supporterJWT ? 200 : 0, [200]);

  const jwt2 = await creator.post("/api/auth/jwt");
  const creatorJWT = jwt2.data?.token;
  ok("JWT for creator (Alex)", creatorJWT ? 200 : 0, [200]);

  const jwt3 = await admin.post("/api/auth/jwt");
  const adminJWT = jwt3.data?.token;
  ok("JWT for admin", adminJWT ? 200 : 0, [200]);

  const jwt4 = await supporter2.post("/api/auth/jwt");
  const supporter2JWT = jwt4.data?.token;
  ok("JWT for supporter2 (Jamie)", jwt4.status, [200]);

  // If any JWT failed, abort — we can't make authenticated requests
  if (!supporterJWT || !creatorJWT || !adminJWT || !supporter2JWT) {
    console.log("\nFAILED to get JWT tokens. Debug info:");
    console.log("  supporter:", jwt1.status, JSON.stringify(jwt1.data).substring(0, 200));
    console.log("  creator:", jwt2.status, JSON.stringify(jwt2.data).substring(0, 200));
    console.log("  admin:", jwt3.status, JSON.stringify(jwt3.data).substring(0, 200));
    return;
  }

  console.log(`  Sarah JWT: ${supporterJWT.substring(0, 40)}...`);
  console.log(`  Alex JWT:  ${creatorJWT.substring(0, 40)}...`);
  console.log(`  Admin JWT: ${adminJWT.substring(0, 40)}...`);

  // Helper: builds an Authorization header from a JWT token
  function auth(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
  }

  // A shared client for JWT-authenticated requests (not cookie-based)
  const api = new HttpClient();

  // ───────────────────────────────────────────────────────────────────────────
  // STEP 4: Add Extra Credits (Simulated Purchases)
  // ───────────────────────────────────────────────────────────────────────────
  // Supporters need credits to make contributions. We already gave them 50 each
  // on registration, but we add more so they can contribute to multiple campaigns.
  //
  // POST /api/users/credits
  //   Body: { amount: number }  — adds this many credits to the authenticated user
  //
  // After this step:
  //   Sarah:  50 (signup) + 500 (extra) = 550 credits
  //   Jamie:  50 (signup) + 300 (extra) = 350 credits

  console.log("\n--- Step 4: Adding Extra Credits ---");

  const ac1 = await api.post("/api/users/credits", { amount: 500 }, auth(supporterJWT));
  ok("Add 500 credits to Sarah (total: 550)", ac1.status, [200]);

  const ac2 = await api.post("/api/users/credits", { amount: 300 }, auth(supporter2JWT));
  ok("Add 300 credits to Jamie (total: 350)", ac2.status, [200]);

  // ───────────────────────────────────────────────────────────────────────────
  // STEP 5: Create Campaigns
  // ───────────────────────────────────────────────────────────────────────────
  // Alex (creator) creates 6 campaigns across different categories.
  // All campaigns start in "pending" status until admin approves them.
  //
  // POST /api/campaigns
  //   Requires: creator role (Authorization: Bearer <creator JWT>)
  //   Body fields:
  //     - campaignTitle:       Campaign name shown to supporters
  //     - campaignStory:       Detailed description (supports rich text)
  //     - category:            Technology | Art | Community | Environment | Education | Health
  //     - fundingGoal:         Target amount in credits
  //     - minimumContribution: Minimum credits a supporter can contribute
  //     - deadline:            Campaign end date (YYYY-MM-DD)
  //     - rewardInfo:          What backers get at different tiers
  //     - campaignImageUrl:    Cover image URL (uploaded via imgBB)
  //
  // CAMPAIGNS CREATED:
  //   1. Solar-Powered Water Pump (Technology) — goal: 5000 credits
  //   2. Indie RPG: Echoes of the Forgotten Realm (Art) — goal: 3000 credits
  //   3. Community Garden to Fight Food Deserts (Community) — goal: 2000 credits
  //   4. Ocean Cleanup Drone Prototype (Environment) — goal: 8000 credits
  //   5. Free Coding Bootcamp for Underserved Youth (Education) — goal: 4000 credits
  //   6. Mobile Health Clinic for Remote Villages (Health) — goal: 6000 credits

  console.log("\n--- Step 5: Creating Campaigns ---");

  const campaignsData = [
    {
      campaignTitle: "Solar-Powered Water Pump for Rural Communities",
      campaignStory:
        "Clean water changes everything. We're building a solar-powered water pump system that will provide fresh drinking water to over 5,000 people in rural villages across Sub-Saharan Africa. Our team of engineers has designed a low-maintenance, durable system that operates entirely on solar energy. With your support, we can install the first 10 pumps by the end of this year, transforming entire communities and giving children the gift of time — time they currently spend walking miles to collect water.",
      category: "Technology",
      fundingGoal: 5000,
      minimumContribution: 10,
      deadline: "2026-09-15",
      rewardInfo:
        "Backers contributing 50+ credits receive a personalized thank-you video from the village. 200+ credits get your name engraved on the pump memorial plaque. 500+ credits receive an invite to the installation ceremony.",
      campaignImageUrl:
        "https://images.unsplash.com/photo-1509391366360-2e959784a276?w=600&h=400&fit=crop",
    },
    {
      campaignTitle: "Indie RPG: Echoes of the Forgotten Realm",
      campaignStory:
        "After 2 years of solo development, I'm creating a retro-style RPG with a modern twist. Echoes of the Forgotten Realm features a hand-drawn pixel art world, a 40+ hour story-driven campaign, and a unique memory-based magic system where spells are tied to your character's past. Every player's magic loadout is different based on their choices. I need funding for final art assets, voice acting, and music composition. The demo has already received 15,000 downloads and overwhelmingly positive feedback.",
      category: "Art",
      fundingGoal: 3000,
      minimumContribution: 5,
      deadline: "2026-08-30",
      rewardInfo:
        "10+ credits: Digital artbook. 50+ credits: Name in game credits + beta access. 200+ credits: Design a custom NPC with our team. 500+ credits: Exclusive collector's edition physical copy.",
      campaignImageUrl:
        "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=600&h=400&fit=crop",
    },
    {
      campaignTitle: "Community Garden to Fight Food Deserts",
      campaignStory:
        "Our neighborhood hasn't had a grocery store in 8 years. Families travel 45 minutes by bus to buy fresh produce. We're converting an abandoned lot into a thriving community garden with raised beds, a greenhouse, and a weekly farmer's market. Our plan includes free cooking classes, nutrition workshops, and a produce delivery service for elderly residents. We've already secured the land donation and city permits — now we need your help to build it.",
      category: "Community",
      fundingGoal: 2000,
      minimumContribution: 5,
      deadline: "2026-10-01",
      rewardInfo:
        "25+ credits: Seasonal produce box. 100+ credits: Your own raised bed for a year. 300+ credits: Private garden party invitation with the community.",
      campaignImageUrl:
        "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=600&h=400&fit=crop",
    },
    {
      campaignTitle: "Ocean Cleanup Drone Prototype",
      campaignStory:
        "Plastic pollution is killing our oceans. We've designed an autonomous drone that identifies, collects, and sorts ocean plastic using AI-powered cameras. Our prototype has already collected 500kg of plastic in test runs. With proper funding, we can scale to 20 drones operating along major ocean garbage patches. The drone is solar-powered and communicates real-time data about ocean health to researchers worldwide.",
      category: "Environment",
      fundingGoal: 8000,
      minimumContribution: 20,
      deadline: "2026-11-30",
      rewardInfo:
        "50+ credits: Real-time ocean data dashboard access. 200+ credits: Name a drone + GPS tracking. 1000+ credits: Ride-along on a cleanup mission.",
      campaignImageUrl:
        "https://images.unsplash.com/photo-1484291470158-b8f8d608850d?w=600&h=400&fit=crop",
    },
    {
      campaignTitle: "Free Coding Bootcamp for Underserved Youth",
      campaignStory:
        "Every young person deserves a shot at a tech career. We're launching a free 12-week coding bootcamp for underserved youth aged 16-24 in our city. The program covers web development, UI/UX design, and career readiness — with laptops provided for every student. Our instructors are volunteers from top tech companies, and our graduates have an 85% job placement rate from our pilot program. Help us expand from 30 students per cohort to 100.",
      category: "Education",
      fundingGoal: 4000,
      minimumContribution: 10,
      deadline: "2026-09-30",
      rewardInfo:
        "25+ credits: Thank you from a student. 100+ credits: Video call with graduating class. 500+ credits: Sponsor a student's full laptop + tuition.",
      campaignImageUrl:
        "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=600&h=400&fit=crop",
    },
    {
      campaignTitle: "Mobile Health Clinic for Remote Villages",
      campaignStory:
        "Thousands of people in remote mountain villages have never seen a doctor. Our mobile health clinic — a fully equipped van — will travel to 50+ villages providing basic healthcare, vaccinations, and maternal care. Each trip serves approximately 200 patients. With your support, we can keep the clinic running for a full year, covering fuel, medical supplies, and staffing. Last year our pilot reached 3,000 patients and detected 45 cases that required urgent care.",
      category: "Health",
      fundingGoal: 6000,
      minimumContribution: 15,
      deadline: "2026-12-15",
      rewardInfo:
        "50+ credits: Personal impact report showing lives touched. 200+ credits: Name on the clinic. 800+ credits: Join a clinic trip and see the impact firsthand.",
      campaignImageUrl:
        "https://images.unsplash.com/photo-1584982751601-97dcc096659c?w=600&h=400&fit=crop",
    },
  ];

  // Store campaign IDs for use in later steps (contributions, reports)
  const campaignIds: string[] = [];
  for (const c of campaignsData) {
    const res = await api.post("/api/campaigns", c, auth(creatorJWT));
    const id = res.data?._id;
    campaignIds.push(id);
    ok(
      `Campaign: "${c.campaignTitle.substring(0, 40)}..." (${c.category}, goal: ${c.fundingGoal})`,
      res.status,
      [201]
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // STEP 6: Admin Approves All Campaigns
  // ───────────────────────────────────────────────────────────────────────────
  // Campaigns are created with status "pending". Only admin can approve them.
  // Approved campaigns appear in the public Explore page and can receive
  // contributions.
  //
  // PATCH /api/campaigns/:id/approve
  //   Requires: admin role
  //   This also creates a notification for the campaign creator.

  console.log("\n--- Step 6: Admin Approving All Campaigns ---");

  for (let i = 0; i < campaignIds.length; i++) {
    if (!campaignIds[i]) continue;
    const res = await api.patch(
      `/api/campaigns/${campaignIds[i]}/approve`,
      {},
      auth(adminJWT)
    );
    ok(
      `Approve campaign ${i + 1}: "${campaignsData[i].campaignTitle.substring(0, 35)}..."`,
      res.status,
      [200]
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // STEP 7: Supporters Make Contributions
  // ───────────────────────────────────────────────────────────────────────────
  // Sarah and Jamie contribute credits to various approved campaigns.
  // Each contribution deducts credits from the supporter's account and creates
  // a pending contribution record. The creator must approve/reject it.
  //
  // POST /api/contributions
  //   Requires: supporter role
  //   Body:
  //     - campaignId:          The campaign's MongoDB _id
  //     - contributionAmount:  Number of credits to contribute
  //   Server-side behavior:
  //     1. Validates campaign is approved
  //     2. Validates minimum contribution amount
  //     3. Checks supporter has enough credits
  //     4. Deducts credits from supporter
  //     5. Creates contribution with status "pending"
  //     6. Notifies the campaign creator
  //
  // CONTRIBUTION PLAN:
  //   Sarah (550 credits): 200→Campaign1, 150→Campaign2, 100→Campaign3, 50→Campaign5
  //   Jamie (350 credits): 300→Campaign1, 200→Campaign4 (may fail if insufficient)
  //                        100→Campaign6 (may fail if insufficient)

  console.log("\n--- Step 7: Supporters Making Contributions ---");

  const contribs = [
    // Sarah contributes to campaigns 1, 2, 3, 5
    { idx: 0, amount: 200, by: "Sarah", jwt: supporterJWT },
    { idx: 1, amount: 150, by: "Sarah", jwt: supporterJWT },
    { idx: 2, amount: 100, by: "Sarah", jwt: supporterJWT },
    { idx: 4, amount: 50, by: "Sarah", jwt: supporterJWT },
    // Jamie contributes to campaigns 1, 4, 6
    { idx: 0, amount: 300, by: "Jamie", jwt: supporter2JWT },
    { idx: 3, amount: 200, by: "Jamie", jwt: supporter2JWT },
    { idx: 5, amount: 100, by: "Jamie", jwt: supporter2JWT },
  ];

  // Store contribution IDs for the review step
  const contributionIds: string[] = [];
  for (const c of contribs) {
    const cid = campaignIds[c.idx];
    if (!cid) continue;
    const res = await api.post(
      "/api/contributions",
      { campaignId: cid, contributionAmount: c.amount },
      auth(c.jwt)
    );
    contributionIds.push(res.data?._id);
    ok(
      `${c.by} contributes ${c.amount} credits → Campaign ${c.idx + 1}: "${campaignsData[c.idx].campaignTitle.substring(0, 30)}..."`,
      res.status,
      [201]
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // STEP 8: Creator Reviews Contributions
  // ───────────────────────────────────────────────────────────────────────────
  // Alex reviews all pending contributions. He approves most but rejects the
  // last one to demonstrate the rejection flow (which refunds credits).
  //
  // GET /api/contributions/pending
  //   Returns all contributions with status "pending" for this creator's campaigns.
  //
  // PATCH /api/contributions/:id/approve
  //   - Changes contribution status to "approved"
  //   - Adds contributionAmount to campaign's amountRaised
  //   - Notifies the supporter
  //
  // PATCH /api/contributions/:id/reject
  //   - Changes contribution status to "rejected"
  //   - Refunds credits to the supporter's account
  //   - Notifies the supporter with refund info

  console.log("\n--- Step 8: Creator Reviews Contributions ---");

  const pendingRes = await api.get("/api/contributions/pending", auth(creatorJWT));
  const pendingList = Array.isArray(pendingRes.data) ? pendingRes.data : [];
  console.log(`  Found ${pendingList.length} pending contributions to review`);

  for (let i = 0; i < pendingList.length; i++) {
    const c = pendingList[i];
    if (i < pendingList.length - 1) {
      // Approve all except the last one
      const res = await api.patch(
        `/api/contributions/${c._id}/approve`,
        {},
        auth(creatorJWT)
      );
      ok(
        `Approve: ${c.supporterName} contributed ${c.contributionAmount} credits to "${c.campaignTitle?.substring(0, 30)}"`,
        res.status,
        [200]
      );
    } else {
      // Reject the last one (demonstrates credit refund)
      const res = await api.patch(
        `/api/contributions/${c._id}/reject`,
        {},
        auth(creatorJWT)
      );
      ok(
        `Reject: ${c.supporterName}'s ${c.contributionAmount} credits refunded`,
        res.status,
        [200]
      );
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // STEP 9: Simulate Credit Purchases (Payment History)
  // ───────────────────────────────────────────────────────────────────────────
  // Records credit purchase payments in the system. In production, these would
  // be created after a successful Stripe Checkout Session, but here we use
  // the fallback endpoint that directly records the payment.
  //
  // POST /api/payments (fallback — not Stripe Checkout)
  //   Body:
  //     - credits: Number of credits purchased
  //     - amount:  Dollar amount paid
  //     - method:  Payment method ("Stripe", "Bkash", etc.)
  //
  // CREDIT PACKAGES (Stripe):
  //   - 100 credits = $10
  //   - 300 credits = $25
  //   - 800 credits = $60
  //   - 1500 credits = $110
  //
  // Note: This also adds the purchased credits to the user's balance.

  console.log("\n--- Step 9: Simulating Credit Purchases ---");

  const pay1 = await api.post(
    "/api/payments",
    { credits: 300, amount: 25, method: "Stripe" },
    auth(supporterJWT)
  );
  ok("Sarah purchases 300 credits for $25 via Stripe", pay1.status, [201]);

  const pay2 = await api.post(
    "/api/payments",
    { credits: 100, amount: 10, method: "Stripe" },
    auth(supporter2JWT)
  );
  ok("Jamie purchases 100 credits for $10 via Stripe", pay2.status, [201]);

  // ───────────────────────────────────────────────────────────────────────────
  // STEP 10: Creator Requests Withdrawals
  // ───────────────────────────────────────────────────────────────────────────
  // Alex requests to withdraw earned credits as real money.
  //
  // WITHDRAWAL RULES:
  //   - 20 credits = $1 withdrawal rate
  //   - Minimum withdrawal: 200 credits ($10)
  //   - Credits come from approved campaign contributions (amountRaised)
  //
  // POST /api/withdrawals
  //   Requires: creator role
  //   Body:
  //     - withdrawalCredit: How many credits to withdraw
  //     - paymentSystem:    "Stripe" | "Bkash" | "Nagad" | etc.
  //     - accountNumber:    Payment account identifier
  //
  // Note: Withdrawals are created as "pending" until admin approves.

  console.log("\n--- Step 10: Creator Withdrawal Requests ---");

  const w1 = await api.post(
    "/api/withdrawals",
    {
      withdrawalCredit: 250,
      paymentSystem: "Stripe",
      accountNumber: "acct_stripe_alex_123",
    },
    auth(creatorJWT)
  );
  ok("Alex requests withdrawal: 250 credits ($12.50) via Stripe", w1.status, [201]);

  const w2 = await api.post(
    "/api/withdrawals",
    {
      withdrawalCredit: 350,
      paymentSystem: "Bkash",
      accountNumber: "01712345678",
    },
    auth(creatorJWT)
  );
  ok("Alex requests withdrawal: 350 credits ($17.50) via Bkash", w2.status, [201]);

  // ───────────────────────────────────────────────────────────────────────────
  // STEP 11: Admin Approves Withdrawals
  // ───────────────────────────────────────────────────────────────────────────
  // Admin reviews pending withdrawal requests and approves them.
  // Approval deducts the credits from the creator's campaign(s) amountRaised.
  //
  // GET /api/withdrawals/pending
  //   Returns all withdrawal requests with status "pending".
  //
  // PATCH /api/withdrawals/:id/approve
  //   - Changes status to "approved"
  //   - Deducts from creator's campaign(s) amountRaised
  //   - Notifies the creator

  console.log("\n--- Step 11: Admin Processes Withdrawals ---");

  const pendingW = await api.get("/api/withdrawals/pending", auth(adminJWT));
  const wList = Array.isArray(pendingW.data) ? pendingW.data : [];
  console.log(`  Found ${wList.length} pending withdrawal requests`);

  for (const w of wList) {
    const res = await api.patch(
      `/api/withdrawals/${w._id}/approve`,
      {},
      auth(adminJWT)
    );
    ok(
      `Approve withdrawal: ${w.withdrawalCredit} credits ($${(w.withdrawalCredit / 20).toFixed(2)}) from ${w.creatorName} via ${w.paymentSystem}`,
      res.status,
      [200]
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // STEP 12: Supporters Report Campaigns
  // ───────────────────────────────────────────────────────────────────────────
  // Supporters can flag suspicious or problematic campaigns for admin review.
  //
  // POST /api/reports
  //   Body:
  //     - campaignId: The campaign to report
  //     - reason:     Description of the concern
  //
  // Reports are created with status "open". Admin can:
  //   - Resolve (mark as reviewed)
  //   - Suspend the campaign (change status to "rejected")
  //   - Delete the campaign (refunds all contributors)

  console.log("\n--- Step 12: Supporters Reporting Campaigns ---");

  const rep1 = await api.post(
    "/api/reports",
    {
      campaignId: campaignIds[4],
      reason:
        "The budget breakdown seems inflated. Laptop cost of $800 per student is much higher than market rate for educational devices. Please verify the budget allocation.",
    },
    auth(supporterJWT)
  );
  ok(
    'Sarah reports "Coding Bootcamp" — inflated budget concern',
    rep1.status,
    [201]
  );

  const rep2 = await api.post(
    "/api/reports",
    {
      campaignId: campaignIds[5],
      reason:
        "The campaign photos appear to be stock images rather than actual clinic photos. The creator has no verifiable medical background or organizational affiliation. This may be a scam.",
    },
    auth(supporter2JWT)
  );
  ok(
    'Jamie reports "Health Clinic" — suspicious stock photos',
    rep2.status,
    [201]
  );

  // ───────────────────────────────────────────────────────────────────────────
  // STEP 13: Verify Notifications
  // ───────────────────────────────────────────────────────────────────────────
  // Notifications are auto-created by various actions throughout the seed:
  //   - Campaign approval → notification to creator
  //   - New contribution → notification to creator
  //   - Contribution approved/rejected → notification to supporter
  //   - Withdrawal processed → notification to creator
  //
  // GET /api/notifications
  //   Returns all notifications for the authenticated user (newest first).

  console.log("\n--- Step 13: Verifying Notifications ---");

  const notifS = await api.get("/api/notifications", auth(supporterJWT));
  const notifC = await api.get("/api/notifications", auth(creatorJWT));
  const notifA = await api.get("/api/notifications", auth(adminJWT));

  ok("Sarah's notifications", notifS.status, [200]);
  console.log(`    Count: ${Array.isArray(notifS.data) ? notifS.data.length : 0}`);
  ok("Alex's notifications", notifC.status, [200]);
  console.log(`    Count: ${Array.isArray(notifC.data) ? notifC.data.length : 0}`);
  ok("Admin's notifications", notifA.status, [200]);
  console.log(`    Count: ${Array.isArray(notifA.data) ? notifA.data.length : 0}`);

  // ───────────────────────────────────────────────────────────────────────────
  // STEP 14: Final Verification
  // ───────────────────────────────────────────────────────────────────────────
  // Query all endpoints to verify the data was inserted correctly.
  // This is a sanity check — the counts should match the expected numbers.

  console.log("\n--- Step 14: Final Verification ---");

  // Count all campaigns (admin endpoint returns all, regardless of status)
  const allCampaigns = await api.get("/api/campaigns/admin/all", auth(adminJWT));
  const campaignsList = Array.isArray(allCampaigns.data) ? allCampaigns.data : [];
  console.log(`  Total campaigns in DB: ${campaignsList.length} (expected: 6)`);

  // Top funded campaigns (public endpoint, approved only)
  const topCampaigns = await api.get("/api/campaigns/top");
  const topList = Array.isArray(topCampaigns.data) ? topCampaigns.data : [];
  console.log(`  Top funded campaigns: ${topList.length} (expected: 6)`);

  // Count all users
  const allUsers = await api.get("/api/users/admin/all", auth(adminJWT));
  const usersList = Array.isArray(allUsers.data) ? allUsers.data : [];
  console.log(`  Total users in DB: ${usersList.length} (expected: 4)`);

  // Count all reports
  const allReports = await api.get("/api/reports", auth(adminJWT));
  const reportsList = Array.isArray(allReports.data) ? allReports.data : [];
  console.log(`  Total reports in DB: ${reportsList.length} (expected: 2)`);

  // Sarah's contribution history
  const supportContribs = await api.get(
    "/api/contributions/mine?page=1&limit=10",
    auth(supporterJWT)
  );
  console.log(
    `  Sarah's contributions: ${supportContribs.data?.total || 0} (expected: ~4)`
  );

  // Sarah's payment history
  const supportPayments = await api.get("/api/payments/mine", auth(supporterJWT));
  const payList = Array.isArray(supportPayments.data) ? supportPayments.data : [];
  console.log(`  Sarah's payments: ${payList.length} (expected: 1)`);

  // Alex's earnings summary
  const creatorEarnings = await api.get(
    "/api/withdrawals/earnings",
    auth(creatorJWT)
  );
  console.log(
    `  Alex's earnings: totalRaised=${creatorEarnings.data?.totalRaised}, withdrawable=$${creatorEarnings.data?.withdrawalAmount}`
  );

  // Admin platform stats
  const stats = await api.get("/api/users/admin/stats", auth(adminJWT));
  console.log(`  Platform stats: ${JSON.stringify(stats.data)}`);

  // ───────────────────────────────────────────────────────────────────────────
  // DONE
  // ───────────────────────────────────────────────────────────────────────────

  console.log("\n" + "═".repeat(60));
  console.log("  SEED COMPLETE — All data inserted into MongoDB");
  console.log("═".repeat(60));
  console.log("\n  Login credentials:");
  console.log("  ┌────────────┬──────────────────────┬─────────────┐");
  console.log("  │ Role       │ Email                │ Password    │");
  console.log("  ├────────────┼──────────────────────┼─────────────┤");
  console.log("  │ Supporter  │ sarah@test.com       │ Pass1234!   │");
  console.log("  │ Supporter  │ jamie@test.com       │ Pass1234!   │");
  console.log("  │ Creator    │ alex@test.com        │ Pass1234!   │");
  console.log("  │ Admin      │ admin@fundrise.com   │ Admin@1234! │");
  console.log("  └────────────┴──────────────────────┴─────────────┘");
  console.log("\n  Open http://localhost:5173 to see the frontend.");
  console.log("");
}

// ═══════════════════════════════════════════════════════════════════════════════
// Run the seed
// ═══════════════════════════════════════════════════════════════════════════════

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
