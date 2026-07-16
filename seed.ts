import "dotenv/config";
import http from "node:http";

const BASE = "http://localhost:5000";

// ─── Cookie-aware HTTP helper ───────────────────────────────────────────────

interface CookieJar {
  [key: string]: string;
}

function parseCookies(setCookieHeaders: string[]): CookieJar {
  const jar: CookieJar = {};
  for (const header of setCookieHeaders) {
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

function cookieString(jar: CookieJar): string {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

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
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...extraHeaders,
      };

      if (Object.keys(this.cookies).length > 0) {
        headers["Cookie"] = cookieString(this.cookies);
      }

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
          // Merge cookies
          const sc = res.headers["set-cookie"];
          if (sc) {
            const newCookies = parseCookies(sc);
            Object.assign(this.cookies, newCookies);
          }

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

function ok(label: string, status: number, expected: number[]) {
  const pass = expected.includes(status);
  const icon = pass ? "\u2705" : "\u274c";
  console.log(`  ${icon} ${label}: ${status}${pass ? "" : ` (expected ${expected.join("|")})`}`);
  return pass;
}

// ─── Main Seed ──────────────────────────────────────────────────────────────

async function main() {
  console.log("=== FundRise Database Seed (TypeScript) ===\n");

  // ── 0. Health check ──
  const health = await (new HttpClient()).get("/api/health");
  console.log("Health:", health.data.status, health.data.database);

  // ── 1. Register users via better-auth ──
  console.log("\n--- 1. Registering Users ---");

  const supporter = new HttpClient();
  const creator = new HttpClient();
  const admin = new HttpClient();
  const supporter2 = new HttpClient();

  // Register supporter (Sarah)
  const r1 = await supporter.post("/api/auth/sign-up/email", {
    name: "Sarah Mitchell",
    email: "sarah@test.com",
    password: "Pass1234!",
    image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop",
  });
  ok("Register supporter (Sarah)", r1.status, [200, 201]);

  // Register creator (Alex)
  const r2 = await creator.post("/api/auth/sign-up/email", {
    name: "Alex Rivera",
    email: "alex@test.com",
    password: "Pass1234!",
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop",
  });
  ok("Register creator (Alex)", r2.status, [200, 201]);

  // Register admin
  const r3 = await admin.post("/api/auth/sign-up/email", {
    name: "Admin User",
    email: "admin@fundrise.com",
    password: "Admin@1234!",
    image: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop",
  });
  ok("Register admin", r3.status, [200, 201]);

  // Register 2nd supporter (Jamie)
  const r4 = await supporter2.post("/api/auth/sign-up/email", {
    name: "Jamie Chen",
    email: "jamie@test.com",
    password: "Pass1234!",
    image: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop",
  });
  ok("Register supporter2 (Jamie)", r4.status, [200, 201]);

  // ── 2. Grant registration credits ──
  console.log("\n--- 2. Granting Registration Credits ---");

  // Set role to admin for admin user in DB directly
  // First let's use the register-credits endpoint to set roles and credits
  const rc1 = await supporter.post("/api/auth/register-credits", { role: "supporter" });
  ok("Credits for supporter", rc1.status, [200]);

  const rc2 = await creator.post("/api/auth/register-credits", { role: "creator" });
  ok("Credits for creator", rc2.status, [200]);

  const rc3 = await admin.post("/api/auth/register-credits", { role: "admin" });
  ok("Credits for admin", rc3.status, [200]);

  const rc4 = await supporter2.post("/api/auth/register-credits", { role: "supporter" });
  ok("Credits for supporter2", rc4.status, [200]);

  // ── 3. Get JWT tokens ──
  console.log("\n--- 3. Getting JWT Tokens ---");

  const jwt1 = await supporter.post("/api/auth/jwt");
  const supporterJWT = jwt1.data?.token;
  ok("JWT for supporter", supporterJWT ? 200 : 0, [200]);

  const jwt2 = await creator.post("/api/auth/jwt");
  const creatorJWT = jwt2.data?.token;
  ok("JWT for creator", creatorJWT ? 200 : 0, [200]);

  const jwt3 = await admin.post("/api/auth/jwt");
  const adminJWT = jwt3.data?.token;
  ok("JWT for admin", adminJWT ? 200 : 0, [200]);

  const jwt4 = await supporter2.post("/api/auth/jwt");
  const supporter2JWT = jwt4.data?.token;
  ok("JWT for supporter2", jwt4.status, [200]);

  if (!supporterJWT || !creatorJWT || !adminJWT || !supporter2JWT) {
    console.log("\nFAILED to get JWT tokens. Debug info:");
    console.log("  supporter JWT:", jwt1.status, JSON.stringify(jwt1.data).substring(0, 200));
    console.log("  creator JWT:", jwt2.status, JSON.stringify(jwt2.data).substring(0, 200));
    console.log("  admin JWT:", jwt3.status, JSON.stringify(jwt3.data).substring(0, 200));
    return;
  }

  console.log(`  Supporter JWT: ${supporterJWT.substring(0, 30)}...`);
  console.log(`  Creator JWT: ${creatorJWT.substring(0, 30)}...`);
  console.log(`  Admin JWT: ${adminJWT.substring(0, 30)}...`);

  // Helper to make authenticated requests with JWT
  function auth(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
  }

  const api = new HttpClient();

  // ── 4. Add extra credits to supporter accounts ──
  console.log("\n--- 4. Adding Extra Credits ---");

  const ac1 = await api.post("/api/users/credits", { amount: 500 }, auth(supporterJWT));
  ok("Add 500 credits to supporter", ac1.status, [200]);

  const ac2 = await api.post("/api/users/credits", { amount: 300 }, auth(supporter2JWT));
  ok("Add 300 credits to supporter2", ac2.status, [200]);

  // ── 5. Create campaigns as creator ──
  console.log("\n--- 5. Creating Campaigns ---");

  const campaignsData = [
    {
      campaignTitle: "Solar-Powered Water Pump for Rural Communities",
      campaignStory: "Clean water changes everything. We're building a solar-powered water pump system that will provide fresh drinking water to over 5,000 people in rural villages across Sub-Saharan Africa. Our team of engineers has designed a low-maintenance, durable system that operates entirely on solar energy. With your support, we can install the first 10 pumps by the end of this year, transforming entire communities and giving children the gift of time — time they currently spend walking miles to collect water.",
      category: "Technology",
      fundingGoal: 5000,
      minimumContribution: 10,
      deadline: "2026-09-15",
      rewardInfo: "Backers contributing 50+ credits receive a personalized thank-you video from the village. 200+ credits get your name engraved on the pump memorial plaque. 500+ credits receive an invite to the installation ceremony.",
      campaignImageUrl: "https://images.unsplash.com/photo-1509391366360-2e959784a276?w=600&h=400&fit=crop",
    },
    {
      campaignTitle: "Indie RPG: Echoes of the Forgotten Realm",
      campaignStory: "After 2 years of solo development, I'm creating a retro-style RPG with a modern twist. Echoes of the Forgotten Realm features a hand-drawn pixel art world, a 40+ hour story-driven campaign, and a unique memory-based magic system where spells are tied to your character's past. Every player's magic loadout is different based on their choices. I need funding for final art assets, voice acting, and music composition. The demo has already received 15,000 downloads and overwhelmingly positive feedback.",
      category: "Art",
      fundingGoal: 3000,
      minimumContribution: 5,
      deadline: "2026-08-30",
      rewardInfo: "10+ credits: Digital artbook. 50+ credits: Name in game credits + beta access. 200+ credits: Design a custom NPC with our team. 500+ credits: Exclusive collector's edition physical copy.",
      campaignImageUrl: "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=600&h=400&fit=crop",
    },
    {
      campaignTitle: "Community Garden to Fight Food Deserts",
      campaignStory: "Our neighborhood hasn't had a grocery store in 8 years. Families travel 45 minutes by bus to buy fresh produce. We're converting an abandoned lot into a thriving community garden with raised beds, a greenhouse, and a weekly farmer's market. Our plan includes free cooking classes, nutrition workshops, and a produce delivery service for elderly residents. We've already secured the land donation and city permits — now we need your help to build it.",
      category: "Community",
      fundingGoal: 2000,
      minimumContribution: 5,
      deadline: "2026-10-01",
      rewardInfo: "25+ credits: Seasonal produce box. 100+ credits: Your own raised bed for a year. 300+ credits: Private garden party invitation with the community.",
      campaignImageUrl: "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=600&h=400&fit=crop",
    },
    {
      campaignTitle: "Ocean Cleanup Drone Prototype",
      campaignStory: "Plastic pollution is killing our oceans. We've designed an autonomous drone that identifies, collects, and sorts ocean plastic using AI-powered cameras. Our prototype has already collected 500kg of plastic in test runs. With proper funding, we can scale to 20 drones operating along major ocean garbage patches. The drone is solar-powered and communicates real-time data about ocean health to researchers worldwide.",
      category: "Environment",
      fundingGoal: 8000,
      minimumContribution: 20,
      deadline: "2026-11-30",
      rewardInfo: "50+ credits: Real-time ocean data dashboard access. 200+ credits: Name a drone + GPS tracking. 1000+ credits: Ride-along on a cleanup mission.",
      campaignImageUrl: "https://images.unsplash.com/photo-1484291470158-b8f8d608850d?w=600&h=400&fit=crop",
    },
    {
      campaignTitle: "Free Coding Bootcamp for Underserved Youth",
      campaignStory: "Every young person deserves a shot at a tech career. We're launching a free 12-week coding bootcamp for underserved youth aged 16-24 in our city. The program covers web development, UI/UX design, and career readiness — with laptops provided for every student. Our instructors are volunteers from top tech companies, and our graduates have an 85% job placement rate from our pilot program. Help us expand from 30 students per cohort to 100.",
      category: "Education",
      fundingGoal: 4000,
      minimumContribution: 10,
      deadline: "2026-09-30",
      rewardInfo: "25+ credits: Thank you from a student. 100+ credits: Video call with graduating class. 500+ credits: Sponsor a student's full laptop + tuition.",
      campaignImageUrl: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=600&h=400&fit=crop",
    },
    {
      campaignTitle: "Mobile Health Clinic for Remote Villages",
      campaignStory: "Thousands of people in remote mountain villages have never seen a doctor. Our mobile health clinic — a fully equipped van — will travel to 50+ villages providing basic healthcare, vaccinations, and maternal care. Each trip serves approximately 200 patients. With your support, we can keep the clinic running for a full year, covering fuel, medical supplies, and staffing. Last year our pilot reached 3,000 patients and detected 45 cases that required urgent care.",
      category: "Health",
      fundingGoal: 6000,
      minimumContribution: 15,
      deadline: "2026-12-15",
      rewardInfo: "50+ credits: Personal impact report showing lives touched. 200+ credits: Name on the clinic. 800+ credits: Join a clinic trip and see the impact firsthand.",
      campaignImageUrl: "https://images.unsplash.com/photo-1584982751601-97dcc096659c?w=600&h=400&fit=crop",
    },
  ];

  const campaignIds: string[] = [];
  for (const c of campaignsData) {
    const res = await api.post("/api/campaigns", c, auth(creatorJWT));
    const id = res.data?._id;
    campaignIds.push(id);
    ok(`Campaign: "${c.campaignTitle.substring(0, 40)}"`, res.status, [201]);
  }

  // ── 6. Admin approves all campaigns ──
  console.log("\n--- 6. Admin Approving Campaigns ---");

  for (let i = 0; i < campaignIds.length; i++) {
    if (!campaignIds[i]) continue;
    const res = await api.patch(`/api/campaigns/${campaignIds[i]}/approve`, {}, auth(adminJWT));
    ok(`Approve campaign ${i + 1}`, res.status, [200]);
  }

  // ── 7. Make contributions ──
  console.log("\n--- 7. Making Contributions ---");

  // Supporter 1 (Sarah) contributes to campaigns 0, 1, 2
  const contribs = [
    { idx: 0, amount: 200, by: "supporter", jwt: supporterJWT },
    { idx: 1, amount: 150, by: "supporter", jwt: supporterJWT },
    { idx: 2, amount: 100, by: "supporter", jwt: supporterJWT },
    { idx: 0, amount: 300, by: "supporter2", jwt: supporter2JWT },
    { idx: 3, amount: 200, by: "supporter2", jwt: supporter2JWT },
    { idx: 4, amount: 50, by: "supporter", jwt: supporterJWT },
    { idx: 5, amount: 100, by: "supporter2", jwt: supporter2JWT },
  ];

  const contributionIds: string[] = [];
  for (const c of contribs) {
    const cid = campaignIds[c.idx];
    if (!cid) continue;
    const res = await api.post(
      "/api/contributions",
      {
        campaignId: cid,
        contributionAmount: c.amount,
      },
      auth(c.jwt)
    );
    contributionIds.push(res.data?._id);
    ok(`Contrib ${c.amount} credits by ${c.by} to campaign ${c.idx + 1}`, res.status, [201]);
  }

  // ── 8. Creator reviews contributions ──
  console.log("\n--- 8. Creator Reviews Contributions ---");

  const pendingRes = await api.get("/api/contributions/pending", auth(creatorJWT));
  const pendingList = Array.isArray(pendingRes.data) ? pendingRes.data : [];
  console.log(`  Found ${pendingList.length} pending contributions`);

  for (let i = 0; i < pendingList.length; i++) {
    const c = pendingList[i];
    if (i < pendingList.length - 1) {
      const res = await api.patch(`/api/contributions/${c._id}/approve`, {}, auth(creatorJWT));
      ok(`Approve contrib ${c.contributionAmount} credits`, res.status, [200]);
    } else {
      const res = await api.patch(`/api/contributions/${c._id}/reject`, {}, auth(creatorJWT));
      ok(`Reject last contrib (${c.contributionAmount} credits, refund)`, res.status, [200]);
    }
  }

  // ── 9. Record credit purchase (fallback Stripe) ──
  console.log("\n--- 9. Simulating Credit Purchases ---");

  const pay1 = await api.post(
    "/api/payments",
    { credits: 300, amount: 25, method: "Stripe" },
    auth(supporterJWT)
  );
  ok("Record payment: 300 credits ($25) for supporter", pay1.status, [201]);

  const pay2 = await api.post(
    "/api/payments",
    { credits: 100, amount: 10, method: "Stripe" },
    auth(supporter2JWT)
  );
  ok("Record payment: 100 credits ($10) for supporter2", pay2.status, [201]);

  // ── 10. Creator withdrawal requests ──
  console.log("\n--- 10. Creator Withdrawal Requests ---");

  const w1 = await api.post(
    "/api/withdrawals",
    { withdrawalCredit: 250, paymentSystem: "Stripe", accountNumber: "acct_stripe_alex_123" },
    auth(creatorJWT)
  );
  ok("Withdrawal request: 250 credits (Stripe)", w1.status, [201]);

  const w2 = await api.post(
    "/api/withdrawals",
    { withdrawalCredit: 350, paymentSystem: "Bkash", accountNumber: "01712345678" },
    auth(creatorJWT)
  );
  ok("Withdrawal request: 350 credits (Bkash)", w2.status, [201]);

  // ── 11. Admin approves withdrawals ──
  console.log("\n--- 11. Admin Processes Withdrawals ---");

  const pendingW = await api.get("/api/withdrawals/pending", auth(adminJWT));
  const wList = Array.isArray(pendingW.data) ? pendingW.data : [];
  console.log(`  Found ${wList.length} pending withdrawals`);

  for (const w of wList) {
    const res = await api.patch(`/api/withdrawals/${w._id}/approve`, {}, auth(adminJWT));
    ok(`Approve withdrawal: ${w.withdrawalCredit} credits`, res.status, [200]);
  }

  // ── 12. Create reports ──
  console.log("\n--- 12. Creating Reports ---");

  const rep1 = await api.post(
    "/api/reports",
    {
      campaignId: campaignIds[4],
      reason: "The budget breakdown seems inflated. Laptop cost of $800 per student is much higher than market rate for educational devices. Please verify the budget allocation.",
    },
    auth(supporterJWT)
  );
  ok("Report 1: Budget concerns for Coding Bootcamp", rep1.status, [201]);

  const rep2 = await api.post(
    "/api/reports",
    {
      campaignId: campaignIds[5],
      reason: "The campaign photos appear to be stock images rather than actual clinic photos. The creator has no verifiable medical background or organizational affiliation. This may be a scam.",
    },
    auth(supporter2JWT)
  );
  ok("Report 2: Suspicious campaign (Health Clinic)", rep2.status, [201]);

  // ── 13. Create notifications (already auto-created by actions above) ──
  console.log("\n--- 13. Verifying Notifications ---");

  const notifS = await api.get("/api/notifications", auth(supporterJWT));
  const notifC = await api.get("/api/notifications", auth(creatorJWT));
  const notifA = await api.get("/api/notifications", auth(adminJWT));
  ok("Supporter notifications", notifS.status, [200]);
  console.log(`    Count: ${Array.isArray(notifS.data) ? notifS.data.length : 0}`);
  ok("Creator notifications", notifC.status, [200]);
  console.log(`    Count: ${Array.isArray(notifC.data) ? notifC.data.length : 0}`);
  ok("Admin notifications", notifA.status, [200]);
  console.log(`    Count: ${Array.isArray(notifA.data) ? notifA.data.length : 0}`);

  // ── 14. Verify all data ──
  console.log("\n--- 14. Final Verification ---");

  const allCampaigns = await api.get("/api/campaigns/admin/all", auth(adminJWT));
  const campaignsList = Array.isArray(allCampaigns.data) ? allCampaigns.data : [];
  console.log(`  Total campaigns in DB: ${campaignsList.length}`);

  const topCampaigns = await api.get("/api/campaigns/top");
  const topList = Array.isArray(topCampaigns.data) ? topCampaigns.data : [];
  console.log(`  Top funded campaigns: ${topList.length}`);

  const allUsers = await api.get("/api/users/admin/all", auth(adminJWT));
  const usersList = Array.isArray(allUsers.data) ? allUsers.data : [];
  console.log(`  Total users in DB: ${usersList.length}`);

  const allReports = await api.get("/api/reports", auth(adminJWT));
  const reportsList = Array.isArray(allReports.data) ? allReports.data : [];
  console.log(`  Total reports in DB: ${reportsList.length}`);

  const supportContribs = await api.get("/api/contributions/mine?page=1&limit=10", auth(supporterJWT));
  console.log(`  Supporter contributions: ${supportContribs.data?.total || 0}`);

  const supportPayments = await api.get("/api/payments/mine", auth(supporterJWT));
  const payList = Array.isArray(supportPayments.data) ? supportPayments.data : [];
  console.log(`  Supporter payments: ${payList.length}`);

  const creatorEarnings = await api.get("/api/withdrawals/earnings", auth(creatorJWT));
  console.log(`  Creator earnings: totalRaised=${creatorEarnings.data?.totalRaised}, withdrawable=${creatorEarnings.data?.withdrawalAmount}`);

  const stats = await api.get("/api/users/admin/stats", auth(adminJWT));
  console.log(`  Admin stats: ${JSON.stringify(stats.data)}`);

  console.log("\n=== SEED COMPLETE ===");
  console.log("\nLogin credentials:");
  console.log("  Supporter: sarah@test.com / Pass1234!");
  console.log("  Creator:   alex@test.com / Pass1234!");
  console.log("  Admin:     admin@fundrise.com / Admin@1234!");
  console.log("  Supporter2: jamie@test.com / Pass1234!");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
