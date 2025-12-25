# 🚀 Job Portal API

A **production-ready Job Portal Backend API** supporting authentication, job listings, applications, favorites, file uploads, and a full-featured admin dashboard.

Built with **Node.js**, **Express**, and **Firebase Firestore**.

---

## 🌐 Base URL
```
https://backend-mobile-mad.vercel.app/
```

---

## ✨ Features Overview

- 🔐 Authentication & Authorization (JWT)
- 👤 User Profiles & Statistics
- 💼 Job Listings with Search & Filters
- 📝 Job Applications
- ⭐ Favorite Jobs
- 📎 Resume & Profile Picture Uploads
- 👑 Admin Dashboard (Users, Jobs, Applications)
- 📊 Statistics & Reporting

---

## 🔐 Authentication (`/api/auth`)

### Public Endpoints

| Method | Endpoint | Description | Body |
|------|---------|-------------|------|
| POST | `/register` | Register new user | `{ email, password, fullName, phone? }` |
| POST | `/login` | Login user | `{ email, password }` |
| GET | `/debug` | Server status | — |

### Protected Endpoints

| Method | Endpoint | Description |
|------|---------|-------------|
| GET | `/me` | Get current user profile |

---

## 💼 Jobs (`/api/jobs`)

### Public Endpoints

| Method | Endpoint | Description |
|------|---------|-------------|
| GET | `/` | Search & filter jobs |
| GET | `/:id` | Job details |
| GET | `/categories/all` | Job categories |
| GET | `/types/all` | Job types |
| GET | `/experience-levels/all` | Experience levels |

#### Query Parameters
```
search, location, type, category,
minSalary, maxSalary, remote,
page, limit, sortBy, order
```

---

## 👤 Users (`/api/users`)

### Protected Endpoints

| Method | Endpoint | Description |
|------|---------|-------------|
| GET | `/me` | My profile |
| PUT | `/me` | Update profile |
| PUT | `/me/password` | Change password |
| GET | `/me/applications` | My applications |
| GET | `/me/stats` | My statistics |

---

## 📎 Uploads (`/api/upload`)

### Protected Endpoints

| Method | Endpoint | Description |
|------|---------|-------------|
| POST | `/resume` | Upload resume |
| DELETE | `/resume` | Delete resume |
| POST | `/profile-picture` | Upload profile picture |
| GET | `/files` | List uploaded files |

**Notes**
- `multipart/form-data`
- Max size: **5MB**

---

## ⭐ Favorites (`/api/favourites`)

| Method | Endpoint | Description |
|------|---------|-------------|
| GET | `/` | List favorites |
| POST | `/:jobId` | Add favorite |
| DELETE | `/:jobId` | Remove favorite |
| GET | `/check/:jobId` | Check favorite |

---

## 📝 Applications (`/api/apply`)

| Method | Endpoint | Description |
|------|---------|-------------|
| POST | `/:jobId/apply` | Apply for job |
| GET | `/check/:jobId` | Check status |
| GET | `/` | My applications |
| GET | `/:applicationId` | Application details |
| DELETE | `/:applicationId` | Withdraw application |

---

## 👑 Admin API

### 🛠 Job Management (`/api/admin/jobs`)

| Method | Endpoint | Description |
|------|---------|-------------|
| GET | `/` | All jobs |
| POST | `/` | Create job |
| GET | `/:id` | Job + applications |
| PUT | `/:id` | Update job |
| DELETE | `/:id` | Archive job |
| PATCH | `/:id/status` | Change status |
| PATCH | `/:id/feature` | Feature job |
| GET | `/stats/overview` | Job statistics |

---

### 👥 User Management (`/api/admin/users`)

| Method | Endpoint | Description |
|------|---------|-------------|
| GET | `/` | All users |
| GET | `/:id` | User details |
| PUT | `/:id` | Update user |
| PATCH | `/:id/role` | Change role |
| PATCH | `/:id/ban` | Ban user |
| PATCH | `/:id/unban` | Unban user |
| DELETE | `/:id` | Delete user |
| GET | `/stats/overview` | User stats |
| GET | `/search/:query` | Search users |
| POST | `/bulk-actions` | Bulk actions |
| GET | `/activity/logs` | Audit logs |

---

### 📄 Application Management (`/api/admin/applications`)

| Method | Endpoint | Description |
|------|---------|-------------|
| GET | `/` | All applications |
| GET | `/:id` | Application details |
| PATCH | `/:id/status` | Update status |
| PATCH | `/:id/notes` | Add notes |
| DELETE | `/:id` | Delete |
| POST | `/bulk-status` | Bulk status update |
| GET | `/stats/overview` | Statistics |
| GET | `/export` | Export data |

---

## 🛡 Authentication & Roles

### Authorization Header
```
Authorization: Bearer <idToken>
```

### Token Response Example
```json
{
  "idToken": "jwt-token",
  "refreshToken": "refresh-token",
  "expiresIn": 3600
}
```

### Roles
- `user`
- `admin`
- `employer` (future)

---

## 📁 File Support

| Type | Formats |
|----|--------|
| Resume | PDF, DOC, DOCX, JPG, PNG |
| Avatar | JPG, JPEG, PNG |

Access Path:
```
/uploads/<filename>
```

---

## 📊 Common Query Params
```json
{
  "page": 1,
  "limit": 20,
  "sortBy": "createdAt",
  "order": "desc"
}
```

---

## 📡 Server & Health

| Method | Endpoint | Description |
|------|---------|-------------|
| GET | `/` | API Info |
| GET | `/api/health` | Health check |
| GET | `/api/info` | API metadata |

---

## 🚦 HTTP Status Codes

- **200** OK
- **201** Created
- **400** Bad Request
- **401** Unauthorized
- **403** Forbidden
- **404** Not Found
- **500** Internal Server Error

---

## 📦 Ready to Use

This README is **download-ready** and suitable for:
- GitHub repositories
- Backend documentation
- Postman collections
- Team onboarding

---

✅ Clean • Structured • Production-ready

