# 🚀 Job Portal API

A **production-ready Job Portal Backend API** developed as part of a **Mobile Application Development (MAD) team project**.
This API powers a complete job portal system including **authentication, job listings, applications, favorites, file uploads, and an admin dashboard**.

Built with **Node.js**, **Express**, and **Firebase Firestore**, following real-world backend architecture and best practices.

---

## 🎓 Project Context

* **Course**: Mobile Application Development (MAD)
* **Project Type**: Team Project
* **Role**: Backend Developer
* **Focus**: API design, authentication, business logic, and admin systems

---

## 🌐 Base URL

### Production

```
https://backend-mobile-mad.vercel.app/
```

---

## ✨ Features Overview

* 🔐 Authentication & Authorization (JWT)
* 👤 User Profiles & Statistics
* 💼 Job Listings with Advanced Search & Filters
* 📝 Job Applications & Tracking
* ⭐ Favorite Jobs
* 📎 Resume & Profile Picture Uploads
* 👑 Admin Dashboard (Users, Jobs, Applications)
* 📊 Analytics, Statistics & Reporting
* 🧾 Audit Logs & Bulk Actions

---

## 🧱 System Architecture

```
Client (Mobile / Web)
        |
        | JWT
        v
Backend API (Node.js + Express)
        |
        v
Firebase Firestore
```

---

## 🔐 Authentication (`/api/auth`)

### Public Endpoints

| Method | Endpoint    | Description       | Body                                    |
| ------ | ----------- | ----------------- | --------------------------------------- |
| POST   | `/register` | Register new user | `{ email, password, fullName, phone? }` |
| POST   | `/login`    | Login user        | `{ email, password }`                   |
| GET    | `/debug`    | Server status     | —                                       |

### Protected Endpoints

| Method | Endpoint | Description              |
| ------ | -------- | ------------------------ |
| GET    | `/me`    | Get current user profile |

---

## 💼 Jobs (`/api/jobs`)

### Public Endpoints

| Method | Endpoint                 | Description          |
| ------ | ------------------------ | -------------------- |
| GET    | `/`                      | Search & filter jobs |
| GET    | `/:id`                   | Job details          |
| GET    | `/categories/all`        | Job categories       |
| GET    | `/types/all`             | Job types            |
| GET    | `/experience-levels/all` | Experience levels    |

### Query Parameters

```
search, location, type, category,
minSalary, maxSalary, remote,
page, limit, sortBy, order
```

---

## 👤 Users (`/api/users`)

### Protected Endpoints

| Method | Endpoint           | Description     |
| ------ | ------------------ | --------------- |
| GET    | `/me`              | My profile      |
| PUT    | `/me`              | Update profile  |
| PUT    | `/me/password`     | Change password |
| GET    | `/me/applications` | My applications |
| GET    | `/me/stats`        | My statistics   |

---

## 📎 Uploads (`/api/upload`)

### Protected Endpoints

| Method | Endpoint           | Description            |
| ------ | ------------------ | ---------------------- |
| POST   | `/resume`          | Upload resume          |
| DELETE | `/resume`          | Delete resume          |
| POST   | `/profile-picture` | Upload profile picture |
| GET    | `/files`           | List uploaded files    |

**Upload Rules**

* Content-Type: `multipart/form-data`
* Max file size: **5MB**

---

## ⭐ Favorites (`/api/favourites`)

| Method | Endpoint        | Description           |
| ------ | --------------- | --------------------- |
| GET    | `/`             | List favorites        |
| POST   | `/:jobId`       | Add favorite          |
| DELETE | `/:jobId`       | Remove favorite       |
| GET    | `/check/:jobId` | Check favorite status |

---

## 📝 Applications (`/api/apply`)

| Method | Endpoint          | Description              |
| ------ | ----------------- | ------------------------ |
| POST   | `/:jobId/apply`   | Apply for job            |
| GET    | `/check/:jobId`   | Check application status |
| GET    | `/`               | My applications          |
| GET    | `/:applicationId` | Application details      |
| DELETE | `/:applicationId` | Withdraw application     |

---

## 👑 Admin API

### 🛠 Job Management (`/api/admin/jobs`)

| Method | Endpoint          | Description        |
| ------ | ----------------- | ------------------ |
| GET    | `/`               | All jobs           |
| POST   | `/`               | Create job         |
| GET    | `/:id`            | Job + applications |
| PUT    | `/:id`            | Update job         |
| DELETE | `/:id`            | Archive job        |
| PATCH  | `/:id/status`     | Change job status  |
| PATCH  | `/:id/feature`    | Feature job        |
| GET    | `/stats/overview` | Job statistics     |

---

### 👥 User Management (`/api/admin/users`)

| Method | Endpoint          | Description     |
| ------ | ----------------- | --------------- |
| GET    | `/`               | All users       |
| GET    | `/:id`            | User details    |
| PUT    | `/:id`            | Update user     |
| PATCH  | `/:id/role`       | Change role     |
| PATCH  | `/:id/ban`        | Ban user        |
| PATCH  | `/:id/unban`      | Unban user      |
| DELETE | `/:id`            | Delete user     |
| GET    | `/stats/overview` | User statistics |
| GET    | `/search/:query`  | Search users    |
| POST   | `/bulk-actions`   | Bulk actions    |
| GET    | `/activity/logs`  | Audit logs      |

---

### 📄 Application Management (`/api/admin/applications`)

| Method | Endpoint          | Description            |
| ------ | ----------------- | ---------------------- |
| GET    | `/`               | All applications       |
| GET    | `/:id`            | Application details    |
| PATCH  | `/:id/status`     | Update status          |
| PATCH  | `/:id/notes`      | Add admin notes        |
| DELETE | `/:id`            | Delete application     |
| POST   | `/bulk-status`    | Bulk status update     |
| GET    | `/stats/overview` | Application statistics |
| GET    | `/export`         | Export applications    |

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

* `user`
* `admin`
* `employer` (planned)

---

## 📁 File Support

| File Type | Supported Formats        |
| --------- | ------------------------ |
| Resume    | PDF, DOC, DOCX, JPG, PNG |
| Avatar    | JPG, JPEG, PNG           |

Access Path:

```
/uploads/<filename>
```

---

## 📡 Server & Health

| Method | Endpoint      | Description     |
| ------ | ------------- | --------------- |
| GET    | `/`           | API information |
| GET    | `/api/health` | Health check    |
| GET    | `/api/info`   | API metadata    |

---

## 🚦 HTTP Status Codes

* **200** OK
* **201** Created
* **400** Bad Request
* **401** Unauthorized
* **403** Forbidden
* **404** Not Found
* **500** Internal Server Error

---

## 📈 What This Project Demonstrates

* Production-ready REST API design
* Secure authentication with JWT
* Role-based access control (RBAC)
* Admin dashboard & bulk operations
* File uploads and validation
* Real-world backend structure

---

## 👨‍💻 Author

**Min Phanith**
