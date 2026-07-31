# FindJodi — Backend

Node.js + Express + MongoDB. Every user is a regular member — there is no admin role and no admin portal.

## Folder structure

```
backend/
├── .env.example
└── src/
    ├── server.js              boot, graceful shutdown
    ├── app.js                 express, helmet, cors, rate limit, routes
    │
    ├── config/
    │   ├── env.js             loads + validates .env (exits if misconfigured)
    │   └── db.js              mongoose connection
    │
    ├── models/
    │   ├── User.js            account + biodata + flow flags
    │   ├── Payment.js         Razorpay order lifecycle
    │   └── Interest.js        like / interested signal
    │
    ├── middlewares/
    │   ├── auth.middleware.js     JWT → req.user
    │   ├── access.middleware.js   THE signup-flow rule
    │   └── error.middleware.js    404 + terminal error handler
    │
    ├── controllers/
    │   ├── auth.controller.js     register, verify email, login, me
    │   ├── profile.controller.js  get + update profile
    │   ├── member.controller.js   listing, matches, detail, search
    │   ├── payment.controller.js  Razorpay order + verify
    │   └── interest.controller.js send / respond / notifications
    │
    ├── routes/
    │   ├── index.js           mounts everything under /api
    │   ├── auth.routes.js
    │   ├── profile.routes.js
    │   ├── member.routes.js
    │   ├── payment.routes.js
    │   └── interest.routes.js
    │
    ├── services/
    │   ├── razorpay.service.js  order creation + signature verification
    │   └── email.service.js     SMTP verification mails
    │
    ├── utils/
    │   ├── ApiError.js
    │   ├── asyncHandler.js
    │   ├── response.js         one response shape
    │   └── jwt.js
    │
    └── seed/
        └── seed.js             24 demo members
```

## The flow, in one file

`src/middlewares/access.middleware.js` is the only place the signup flow is decided:

```
register → verify email → login → complete profile
        → [ only when PAYMENT_REQUIRED=true ] pay → dashboard
```

`buildAccess(user)` returns:

```json
{
  "paymentRequired": true,
  "isProfileComplete": false,
  "isPaid": false,
  "canBrowse": false,
  "profileCompletion": 72,
  "nextStep": "complete-profile",
  "redirectTo": "/complete-profile"
}
```

It ships with `/auth/login`, `/auth/me` and `/profile`, so the frontend just follows
`redirectTo` and never re-derives the rule. Setting `PAYMENT_REQUIRED=false` removes
the payment step from the API and the UI at once — no code change.

## API

| Method | Endpoint | Access |
| ------ | -------- | ------ |
| POST | `/api/auth/register` | public — sends the verification email |
| POST | `/api/auth/verify-email` | public — consumes the emailed token |
| POST | `/api/auth/resend-verification` | public |
| POST | `/api/auth/login` | public — **403 until the email is verified** |
| GET | `/api/auth/me` | member |
| GET · PUT | `/api/profile` | member |
| PATCH | `/api/profile/preferences` | member — theme + language |
| POST | `/api/profile/photo` | member — profile picture (multipart `photo`) |
| POST | `/api/profile/gallery` | member — gallery images (multipart `photos`) |
| DELETE | `/api/profile/gallery/:photoId` | member |
| PATCH | `/api/profile/gallery/:photoId/primary` | member |
| GET | `/api/payments/config` | member |
| POST | `/api/payments/order` | member + complete profile |
| POST | `/api/payments/verify` | member |
| POST | `/api/payments/failed` | member |
| GET | `/api/payments/history` | member |
| GET | `/api/members` | **gated** — search & filters |
| GET | `/api/members/matches` | **gated** |
| GET | `/api/members/:id` | **gated** |
| POST · DELETE | `/api/interests/:memberId` | **gated** |
| GET | `/api/interests/received` · `/sent` | **gated** |
| PATCH | `/api/interests/:id/respond` | **gated** |
| GET | `/api/interests/count` | member |
| GET | `/api/meta/options` | public — dropdown values |
| GET | `/health` | public |

**gated** = complete profile + payment when `PAYMENT_REQUIRED=true`.

### Search filters on `/api/members`

`name`, `ageMin`, `ageMax`, `address` (matches address **or** city), `state`,
`district`, `pinCode`, `religion`, `maritalStatus`, `sort`, `page`, `limit`.

Only complete profiles of the opposite gender are ever returned.

## Response shape

```json
{ "success": true, "message": "Members loaded", "data": [], "meta": { "pagination": {} } }
```

Errors add field-level detail the form can render inline:

```json
{ "success": false, "message": "Please check the highlighted fields",
  "errors": { "email": "This email is already registered" } }
```

## Photos

A profile is only complete with **a profile picture plus `MIN_GALLERY_PHOTOS` gallery photos**
(default 5). The rule sits in the same `pre('save')` hook that sets `isProfileComplete`, so it is
enforced on every write — a member cannot reach the dashboard by editing the client.

* Stored on disk under `backend/uploads`, served read-only at `/uploads`.
* JPG, PNG and WebP only; `MAX_UPLOAD_SIZE_MB` per file; `MAX_GALLERY_PHOTOS` in total.
* Replacing the profile picture deletes the old file, so uploads never accumulate.
* `completionPercent()` counts each required gallery slot, so the progress bar moves per upload.
* `missingRequirements()` returns exactly what is still missing, which drives the UI checklist.

Put `backend/uploads` on persistent storage in production (or swap the service for S3/Cloudinary —
only `upload.middleware.js` would change).

## Theme & language

`user.preferences` stores `{ theme: light|dark|system, language: en|hi|mr }` and is returned with the
user object, so a member gets the same settings on any device.
`PATCH /api/profile/preferences` saves a change.

## Email verification (SMTP)

A new account **cannot sign in** until the emailed link is opened — `/auth/login`
returns `403` with `errors.emailNotVerified` so the login page can offer a resend.

Tokens are SHA-256 hashed at rest, single-use, and expire after
`EMAIL_TOKEN_EXPIRY_HOURS`. Resends are throttled to one per minute per account.

With `MAIL_ENABLED=false` nothing is sent — the verification link is printed to the
server console, so the whole flow is testable locally without SMTP.

Gmail: enable 2-factor auth, then create an **App Password** and use it as `SMTP_PASS`.

## Razorpay

Keys come from `.env` only; the amount is read server-side so a client cannot
change what it is charged. Money settles to the bank account linked to your
Razorpay account.

1. `POST /api/payments/order` creates the order (server-side amount).
2. The browser opens Razorpay checkout with that `order_id`.
3. `POST /api/payments/verify` recomputes `HMAC_SHA256(order_id|payment_id, key_secret)`
   and only unlocks the account when it matches the signature Razorpay returned.

Verification is idempotent, so a retried request cannot double-activate a membership.

## Scripts

```bash
npm install
cp .env.example .env      # set MONGO_URI, JWT_SECRET, SMTP_*, Razorpay keys
npm run dev               # http://localhost:5000
npm start                 # production
npm run seed              # 24 demo members (password: Demo@123)
```
