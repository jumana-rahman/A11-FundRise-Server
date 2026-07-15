# FundRise - Crowdfunding Platform (Server)

**Live API:** [https://a11-fundrise-server.vercel.app](https://a11-fundrise-server.vercel.app)

## Admin Credentials
- **Email:** admin@fundrise.com
- **Password:** Admin@123

## Features

- **RESTful API** — Full CRUD endpoints for campaigns, contributions, users, withdrawals, payments, notifications, and reports
- **JWT Authentication** — Secure token-based auth using `jose` for signing and verification
- **better-auth Integration** — Google OAuth support with MongoDB adapter and custom session handling
- **Role-Based Access Control** — Middleware for Supporter, Creator, and Admin authorization on all protected routes
- **Campaign Workflow** — Create → Pending → Admin Approve/Reject → Visible to Supporters
- **Contribution Flow** — Credit deduction on contribution, creator approval/rejection with automatic refund on rejection
- **Withdrawal System** — Creator withdrawal requests with admin processing and credit deduction
- **Notification System** — Automatic in-app notifications for contribution status changes, campaign approvals, and withdrawal processing
- **Report System** — Campaign reporting for suspicious content with admin suspend/delete actions
- **Pagination** — Server-side pagination for contributions, campaigns, users, and payments
- **Credit System** — Registration credits (50 supporter / 20 creator), 10 credits = $1 purchase, 20 credits = $1 withdrawal
- **MongoDB Atlas** — Native MongoDB driver with DNS resolver fix for reliable cloud connectivity

## Tech Stack

- Node.js + Express.js
- TypeScript
- MongoDB (native driver)
- better-auth (Google OAuth + session management)
- jose (JWT signing/verification)
- bcryptjs (password hashing)
- CORS, Cookie Parser, Dotenv

## API Endpoints

### Auth
- `POST /api/auth/register` — Register new user
- `POST /api/auth/login` — Login with email/password
- `POST /api/auth/jwt` — Get JWT token after better-auth session
- `GET /api/auth/**` — better-auth handler (Google OAuth)

### Campaigns
- `GET /api/campaigns` — List approved campaigns
- `GET /api/campaigns/top` — Top 6 funded campaigns
- `GET /api/campaigns/:id` — Campaign details
- `POST /api/campaigns` — Create campaign (creator)
- `PATCH /api/campaigns/:id` — Update campaign
- `DELETE /api/campaigns/:id` — Delete campaign
- `PATCH /api/campaigns/:id/approve` — Approve campaign (admin)
- `PATCH /api/campaigns/:id/reject` — Reject campaign (admin)

### Contributions
- `POST /api/contributions` — Make contribution (supporter)
- `GET /api/contributions/mine` — Paginated contributions (supporter)
- `GET /api/contributions/pending` — Pending contributions (creator)
- `PATCH /api/contributions/:id/approve` — Approve contribution (creator)
- `PATCH /api/contributions/:id/reject` — Reject contribution (creator)

### Users
- `GET /api/users/me` — Current user profile
- `PATCH /api/users/me` — Update profile
- `GET /api/users/admin/all` — All users (admin)
- `GET /api/users/admin/stats` — Platform stats (admin)
- `PATCH /api/users/admin/:id/role` — Change user role (admin)
- `DELETE /api/users/admin/:id` — Delete user (admin)

### Withdrawals
- `POST /api/withdrawals` — Request withdrawal (creator)
- `GET /api/withdrawals/earnings` — Creator earnings
- `GET /api/withdrawals/mine` — Creator withdrawal history
- `GET /api/withdrawals/pending` — Pending withdrawals (admin)
- `PATCH /api/withdrawals/:id/approve` — Process withdrawal (admin)

### Payments
- `POST /api/payments` — Record credit purchase
- `GET /api/payments/mine` — Payment history

### Notifications
- `GET /api/notifications` — User notifications
- `PATCH /api/notifications/:id/read` — Mark as read

### Reports
- `POST /api/reports` — Submit report
- `GET /api/reports` — All reports (admin)
- `PATCH /api/reports/:id/resolve` — Resolve report (admin)

## Getting Started

```bash
npm install
npm run dev
```

The server runs on `http://localhost:5000` by default.

## Environment Variables

```
PORT=5000
MONGODB_URI=mongodb+srv://...
JWT_SECRET=your-secret-key
BETTER_AUTH_SECRET=your-auth-secret
BETTER_AUTH_BASE_URL=http://localhost:5173
```
