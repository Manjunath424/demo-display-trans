# 🌐 Live Display Translator

A production-grade, real-time language translation platform with comprehensive security hardening.

## 🏗️ Architecture

```
live-display-translator/
├── backend/          # Node.js + Express + MongoDB + WebSocket
├── frontend/         # React 18 + Vite + Tailwind CSS
├── docker-compose.yml
└── README.md
```

## ✨ Features

- **Real-time translation** via WebSocket (type-as-you-go)
- **100+ languages** powered by Google Cloud Translation API
- **Language auto-detection**
- **Translation history** with pagination and search
- **User authentication** with JWT + refresh token rotation
- **Admin dashboard** with user management and usage stats

## 🔒 Security Features

| Layer | Measure |
|---|---|
| **API Keys** | Stored only in backend `.env`, never exposed to frontend |
| **Authentication** | JWT (15min access) + Refresh token rotation (7 day, httpOnly cookie) |
| **Password** | bcrypt (cost=12), strength policy, account lockout after 5 fails |
| **Authorization** | RBAC (user / admin), route-level guards |
| **XSS** | Helmet CSP, xss library, DOMPurify on frontend |
| **NoSQL Injection** | express-mongo-sanitize on all requests |
| **Rate Limiting** | Global + per-route (stricter on auth endpoints) |
| **CORS** | Whitelist-only from `ALLOWED_ORIGINS` env var |
| **HTTP Headers** | Helmet with strict Content-Security-Policy |
| **HPP** | HTTP Parameter Pollution protection |
| **Input Validation** | express-validator on all endpoints |
| **Transport** | HTTPS enforced in production, HSTS headers |
| **Logging** | Winston with sensitive field redaction |
| **Database** | Mongoose with sanitization, indexed fields, TTL |

## 🚀 Quick Start

### Prerequisites
- Node.js >= 18
- MongoDB Atlas account (or local MongoDB)
- Google Cloud project with Translation API enabled

### 1. Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Fill in your .env values (see below)
npm run dev
```

### 2. Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

### 3. Environment Variables (Backend)

> ⚠️ **NEVER commit your `.env` file!**

```
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/live-translator
JWT_ACCESS_SECRET=<64-char random string>
JWT_REFRESH_SECRET=<64-char random string>
GOOGLE_TRANSLATE_API_KEY=<your-google-api-key>
ALLOWED_ORIGINS=http://localhost:5173
ADMIN_REGISTRATION_SECRET=<secret for creating admin accounts>
```

**Generate secrets:**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## 🔑 Getting Your Google Translation API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project or select existing
3. Enable **Cloud Translation API**
4. Go to **APIs & Services > Credentials**
5. Create an **API Key**
6. **Restrict the key**: Application restrictions → IP addresses (your server IP)
7. API restrictions → Cloud Translation API only
8. Copy the key to your `.env` as `GOOGLE_TRANSLATE_API_KEY`

> ✅ The key is used ONLY in the backend — it is never sent to the browser.

## 🐳 Docker Deployment

```bash
docker-compose up --build
```

## 📚 API Reference

### Auth Endpoints
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | None | Register new user |
| POST | `/api/auth/login` | None | Login |
| POST | `/api/auth/logout` | User | Logout + invalidate token |
| POST | `/api/auth/refresh` | Cookie | Refresh access token |
| GET | `/api/auth/me` | User | Get current user |
| PATCH | `/api/auth/change-password` | User | Change password |

### Translation Endpoints
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/translate` | User | Translate text |
| GET | `/api/translate/languages` | User | Supported languages |
| GET | `/api/translate/history` | User | Paginated history |
| DELETE | `/api/translate/history/:id` | User | Delete history item |

### Admin Endpoints
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/admin/users` | Admin | List all users |
| PATCH | `/api/admin/users/:id/status` | Admin | Toggle user status |
| GET | `/api/admin/stats` | Admin | Usage statistics |

### WebSocket
```
ws://localhost:5000?token=<access_token>
```
Send: `{ type: 'translate', text: '...', target: 'es', source: 'auto' }`
Receive: `{ type: 'translation', data: { text: '...', detected: 'en', target: 'es' } }`

## 🛡️ Security Checklist for Deployment

- [ ] Set `NODE_ENV=production`
- [ ] Use HTTPS (TLS certificate)
- [ ] Set all secrets to strong random values
- [ ] Restrict Google API key to server IP
- [ ] Set `ALLOWED_ORIGINS` to your exact frontend domain
- [ ] Enable MongoDB Atlas IP whitelist
- [ ] Set up MongoDB Atlas audit logs
- [ ] Run `npm audit` — fix all high/critical
- [ ] Configure firewall to block direct DB access
- [ ] Set up log rotation
- [ ] Enable MongoDB authentication
- [ ] Review and tighten CSP header for production domain
