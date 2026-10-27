# LabLine

> Real-Time Laboratory Assistance and Doubt Resolution Platform

LabLine is an engineering-grade, real-time coordination platform designed for university computer science laboratories. It eliminates chaotic manual queues, provides transparent first-in, first-out (FIFO) scheduling, facilitates structured mentor-student technical discussions with formatted code snippets, and guarantees accountability by giving students exclusive control over session closure and verified ratings.

- **Production Deployment:** [https://labline.onrender.com](https://labline.onrender.com)
- **GitHub Repository:** [https://github.com/sudo-roonakyadav/labline](https://github.com/sudo-roonakyadav/labline)
- **Author:** Ronak Yadav (Scaler School of Technology, `ronak.25bcs10045@sst.scaler.com`)

---

## Project Demo

Watch the demonstration of LabLine, including the problem it solves, student and mentor workflows, real-time doubt conversations, image attachments, and session closure.

[Watch the LabLine Demo](https://drive.google.com/file/d/1A7gjoFL6rbqGYLpuXDOHjamx8K-YnNGf/view?usp=sharing)

---

## Table of Contents

- [Project Demo](#project-demo)
1. [Problem Statement](#1-problem-statement)
2. [Target Users](#2-target-users)
3. [Proposed Solution](#3-proposed-solution)
4. [Key Features](#4-key-features)
5. [Technology Stack](#5-technology-stack)
6. [Architecture and System Flow](#6-architecture-and-system-flow)
7. [Local Development Setup](#7-local-development-setup)
8. [Environment Variables](#8-environment-variables)
9. [Deployment and Health Monitoring](#9-deployment-and-health-monitoring)
10. [REST API Reference](#10-rest-api-reference)
11. [Data Models](#11-data-models)
12. [Automated Testing and Verification](#12-automated-testing-and-verification)

---

## 1. Problem Statement

University laboratory sessions and hands-on coding practicals face recurring operational bottlenecks:

- **Chaotic Hand-Raising and Queue Invisibility:** Students raise hands or call across crowded physical or virtual lab rooms. Mentors are forced to scan rows manually, leading to skipped students, unfair wait times, and frustration.
- **Context Loss and Syntax Ambiguity:** When mentors arrive at a workstation, students spend several minutes re-explaining their bug, stack trace, or algorithmic block from scratch without prior code visibility.
- **Mentor Starvation and Race Conditions:** Without a single synchronized queue, multiple lab assistants frequently approach the same student while other students wait unattended for extended periods.
- **Absence of Accountability and Session Quality Data:** Traditional lab sessions provide zero post-resolution data. Instructors cannot see common error patterns, average wait-to-resolution times, or student satisfaction.
- **Premature Ticket Closure:** In generic ticketing systems, support staff frequently close tickets prematurely before the student has actually tested and confirmed the fix.

---

## 2. Target Users

LabLine serves two primary personas within academic and technical training environments:

### The Student
- Enrolled in computer science courses (DSA, Web Development, Systems, Database Engineering).
- Needs quick, orderly assistance when encountering compiler errors, segmentation faults, or environment configuration bugs.
- Requires transparency into their queue position, wait estimation, and who is currently helping them.
- Retains exclusive authority to verify whether their doubt was resolved before rating the interaction.

### The Mentor / Teaching Assistant / Lab Instructor
- Responsible for assisting 30 to 80+ students across a 2-to-3 hour laboratory block.
- Needs an uncluttered, real-time feed of pending doubts categorized by topic (DSA, Frontend, Backend, Database, Environment).
- Requires one-click atomic claiming of tickets to prevent duplicate effort.
- Needs real-time communication to review code snippets and guide students toward self-sufficient debugging.

---

## 3. Proposed Solution

LabLine establishes a bidirectional, real-time help-desk protocol tailored specifically for technical education:

1. **Structured Ingestion:** Students submit doubts with categorized tags, detailed descriptions, and formatted source code snippets up to 3,000 characters.
2. **Transparent FIFO Scheduling:** The server maintains an ordered queue. Every waiting student sees their exact position (e.g., "Position #1", "Position #4") and honest wait estimations calculated from recent resolution velocities.
3. **Atomic Mutual Exclusion:** Mentors claim tickets via atomic database operations (`findOneAndUpdate` with status criteria), guaranteeing that two mentors cannot simultaneously claim the same student request.
4. **Interactive Turn-Taking:** Once claimed, the request transitions into an active collaboration workspace. Both student and mentor exchange focused follow-up messages with real-time Socket.IO broadcasts and state badges (`awaiting_mentor`, `awaiting_student`).
5. **Student-Centric Closure and 5-Star Feedback:** Mentors are strictly forbidden from closing requests. Only the student who originated the doubt can mark it resolved and submit a mandatory 1-to-5 star rating and feedback comment.

---

## 4. Key Features

- **Dual-Role Registration:** Distinct onboarding pathways for Students and Teachers. Teacher accounts require a cryptographically verified server-side invitation code (`TEACHER_INVITE_CODE`) to prevent unauthorized role escalation.
- **Real-Time WebSocket Synchronization:** Instantaneous UI synchronization across all connected clients via Socket.IO events (`queue:changed`, `request:message`). No manual page refreshes required.
- **Secure Evidence & Image Attachments:** Students and mentors can attach up to 3 screenshots or images per doubt submission or conversation message (up to 5 MB each, JPEG, PNG, or WebP). Uploads are verified via binary magic byte signatures and stored natively in MongoDB GridFS with strict role-based access authorization and fullscreen lightbox inspection.
- **Defensive Concurrency & Atomic Operations:** MongoDB atomic operators prevent race conditions when multiple teaching assistants click "Claim" at the exact same millisecond.
- **Interactive Code Formatting:** Clean monospace code snippet displays preserving indentation, line wrapping, and syntax distinction.
- **Multi-Level Input Validation:** Strict character bounds, schema sanitization, and category whitelisting on both client and Express middleware layers.
- **Mentor Availability Controls:** Mentors can toggle their active/inactive status, allowing the queue intelligence engine to compute realistic wait times based only on active staff.
- **Session History & Reflection:** Filterable and searchable historical archives of all completed sessions, including code snippets, conversation logs, image attachments, and student feedback.
- **Enterprise-Grade Observability:** Three dedicated health and readiness probes (`/api/health`, `/api/health/ready`, `/api/health/live`) reporting database ping, socket connection counts, uptime, and system memory.
- **Zero-Dependency Aesthetic UI:** Scoped custom CSS architecture (SIGNAL design system) featuring high-contrast typography, warm dark mode, responsive layouts from 375px mobile to 1440px desktop, and zero bloated CSS frameworks.

---

## 5. Technology Stack

### Frontend Architecture
- **Framework:** React 18 (Vite SPA)
- **Styling:** Custom CSS variables, scoped component styles, responsive grid/flex layouts, CSS-driven telemetry visualizers.
- **Client Networking:** Native `fetch` with credentialed cookie transport and `socket.io-client` for persistent duplex streaming.
- **Attachments UI:** Custom image picker with file allowance tracking (`X / 3 images`), format/size validation, thumbnail grid, and accessible fullscreen lightbox modal (`Esc` key support).
- **Performance:** Optimized lifecycle decoupling, ref-based socket listeners preventing re-render loops, and lazy asset loading.

### Backend Architecture
- **Runtime:** Node.js (v20+ LTS recommended)
- **Application Server:** Express.js 4.x
- **Real-Time Engine:** Socket.IO 4.x with CORS credentials and broadcast emitters.
- **Image Processing & Storage:** Multer memory storage with binary magic byte signature verification (`image/jpeg`, `image/png`, `image/webp`) and MongoDB GridFS streaming bucket.
- **Security:** HTTP-only strict session cookies, `bcryptjs` password hashing (salt rounds: 10), and strict Content-Type enforcement.

### Database & Persistence
- **Database:** MongoDB Atlas (Mongoose ODM)
- **Binary Storage:** MongoDB GridFS (`attachments` bucket) for zero-cost, persistent binary storage directly in the MongoDB cluster.
- **Schema Design:** Normalized `User` accounts and `HelpRequest` documents with embedded `messages` array, `attachments` metadata arrays, and `feedback` object.
- **Indices:** Compound index on `{ status: 1, createdAt: 1 }` for high-throughput FIFO queue reads.

### Infrastructure & Deployment
- **Cloud Provider:** Render (Web Service, Singapore region)
- **Node Environment:** Production (`NODE_ENV=production`)
- **Automated Blueprint:** Declarative `render.yaml` specification with automated builds (`npm ci --include=dev && npm run build`) and start command (`npm start`).
- **Routing:** Express wildcard route serving Vite's compiled `index.html` for client-side SPA routing, while maintaining strict JSON 404 handlers for all API routes.

---

## 6. Architecture and System Flow

### System Component Architecture

```text
+-------------------------------------------------------------------------+
|                              CLIENT BROWSER                             |
|                                                                         |
|   +-----------------------+                 +-----------------------+   |
|   |   Student Workspace   |                 |   Mentor Workspace    |   |
|   |  - Doubt Submission   |                 |  - Real-time Queue    |   |
|   |  - Image Attachments  |                 |  - Atomic Claiming    |   |
|   |  - Queue Tracker      |                 |  - Reply & Guidance   |   |
|   |  - Interactive Chat   |                 |  - Image Attachments  |   |
|   |  - Session Close/Rate |                 |  - History & Metrics  |   |
|   +-----------+-----------+                 +-----------+-----------+   |
|               |                                         |               |
+---------------+-----------------------------------------+---------------+
                | HTTP REST / Multipart (Cookies)         | Socket.IO
                v                                         v
+-------------------------------------------------------------------------+
|                         EXPRESS APPLICATION SERVER                      |
|                                                                         |
|  +--------------------+   +--------------------+   +-----------------+  |
|  |  Auth & Role Gates |   | Request Controller |   | Socket Gateway  |  |
|  |  (JWT in Cookie)   |   | (FIFO / Atomic)    |   | (Broadcasts)    |  |
|  +---------+----------+   +---------+----------+   +--------+--------+  |
|            |                        |                       |           |
|            |              +---------+----------+            |           |
|            |              | GridFS Image Store |            |           |
|            |              +---------+----------+            |           |
|            |                        |                       |           |
+------------+------------------------+-----------------------+-----------+
                                      | Mongoose ODM / GridFS
                                      v
+-------------------------------------------------------------------------+
|                           MONGODB ATLAS                                 |
|                                                                         |
|  +---------------------+  +---------------------+  +------------------+ |
|  |  Users Collection   |  | HelpRequests Coll.  |  |  GridFS Buckets  | |
|  | - name, email, role |  | - topic, status     |  | - attachments.   | |
|  | - passwordHash      |  | - attachments: []   |  |   files          | |
|  | - isAvailable       |  | - messages: [...]   |  | - attachments.   | |
|  |                     |  | - feedback: {...}   |  |   chunks         | |
|  +---------------------+  +---------------------+  +------------------+ |
+-------------------------------------------------------------------------+
```

### Help Request Lifecycle State Machine

```text
       [ Student Submits Doubt ]
                  |
                  v
             +---------+
             | WAITING | <------- (Position #1, #2, #3... FIFO Queue)
             +----+----+
                  |
         +--------+--------+
         |                 |
  (Student Cancels)   (Mentor Claims) [Atomic findOneAndUpdate]
         |                 |
         v                 v
   +-----------+      +---------+
   | CANCELLED |      | CLAIMED |
   +-----------+      +----+----+
                           |
                     (Mentor Posts Reply)
                           |
                           v
                  +-----------------+
                  |   IN_PROGRESS   |
                  +--------+--------+
                           |
             +-------------+-------------+
             |                           |
    (Mentor Replies)             (Student Replies)
             |                           |
             v                           v
   +--------------------+      +-------------------+
   |  AWAITING_STUDENT  | <--> |  AWAITING_MENTOR  |
   +--------------------+      +-------------------+
             |                           |
             +-------------+-------------+
                           |
                 (Student Verifies & Closes)
                 * Mentors cannot close *
                           |
                           v
                     +----------+
                     | RESOLVED | (Rating 1-5 & Feedback Saved)
                     +----------+
```

---

## 7. Local Development Setup

Follow these step-by-step instructions to clone, configure, run, and test LabLine locally.

### Prerequisites
- **Node.js:** v18.0.0 or higher (v20+ recommended)
- **npm:** v9.0.0 or higher
- **MongoDB:** Local `mongod` service running on `localhost:27017` or a MongoDB Atlas connection URI
- **Git:** Installed and configured

### Step 1: Clone the Repository
```bash
git clone https://github.com/sudo-roonakyadav/labline.git
cd labline
```

### Step 2: Install Dependencies
LabLine utilizes npm workspaces for modular root, server, and client package management:
```bash
npm install
```

### Step 3: Configure Environment Variables
Copy the example environment configuration into the server directory:
```bash
cp .env.example .env
```
Ensure your `.env` contains valid configuration values (see [Environment Variables](#8-environment-variables) below for details).

### Step 4: Run Development Servers
Start both the Express backend and Vite frontend concurrently with hot-reloading:
```bash
npm run dev
```
The services will be available at:
- **Client Web Application:** `http://localhost:5173`
- **Backend API Server:** `http://localhost:5000`

### Step 5: Execute Automated Test Suites
Run the comprehensive end-to-end integration test suite against an isolated test database:
```bash
npm test
```

### Step 6: Build for Production
Verify that client assets compile cleanly:
```bash
npm run build
```

---

## 8. Environment Variables

All configuration is managed using environment variables. An example configuration template is maintained at `.env.example`:

| Variable | Required | Description | Example / Default |
|---|---|---|---|
| `PORT` | No | Port on which the Express server listens | `5000` |
| `NODE_ENV` | Yes | Application environment mode (`development`, `production`, `test`) | `development` |
| `CLIENT_ORIGIN` | Yes | Authorized CORS origin for browser requests and WebSockets | `http://localhost:5173` |
| `MONGODB_URI` | Yes | MongoDB connection string (Local or MongoDB Atlas) | `mongodb://127.0.0.1:27017/labline` |
| `JWT_SECRET` | Yes | Cryptographic secret for signing session cookies (minimum 32 chars) | `your-secure-random-jwt-secret-key-at-least-32-chars` |
| `JWT_EXPIRES_IN` | No | Lifespan of user authentication tokens | `7d` |
| `TEACHER_INVITE_CODE` | Yes | Shared secret required to register teacher/mentor accounts | `LL-TEACHER-SECURE-KEY-SAMPLE` |

> Note: Never commit production credentials, Atlas passwords, or JWT secrets to source control. Local `.env` and credential files are strictly ignored by `.gitignore`.

---

## 9. Deployment and Health Monitoring

LabLine is deployed as an automated web service on Render in the Singapore region, connected to a cloud-hosted MongoDB Atlas cluster.

- **Live URL:** [https://labline.onrender.com](https://labline.onrender.com)
- **Hosting Model:** $0 Zero-Budget Stack (Render Free Tier + MongoDB Atlas Shared Tier)
- **Continuous Deployment:** Synchronized directly with commits to the `main` branch.
- **Blueprint Configuration:** Fully managed via [`render.yaml`](./render.yaml) (`npm ci --include=dev && npm run build`, `npm start`, readiness probe: `/api/health/ready`).

### Free Tier Operational Notice
On Render's free tier, web instances automatically spin down following 15 minutes of inactivity. When accessed after a dormant period, the initial request will experience a cold-start delay of approximately 30–50 seconds while the container initializes.

### Observability and Health Probes

LabLine provides three dedicated health monitoring endpoints conforming to cloud-native standards:

1. **`GET /api/health` (Comprehensive Diagnostic Probe)**
   Returns server uptime, memory usage, database ping status, and real-time socket statistics.
   ```json
   {
     "status": "ok",
     "service": "labline-server",
     "timestamp": "2026-10-27T10:15:00.000Z",
     "database": {
       "status": "connected",
       "connected": true,
       "host": "cluster0-shard-00-00.mongodb.net",
       "name": "labline"
     },
     "realtime": {
       "status": "operational",
       "connectedSockets": 4
     },
     "memory": {
       "heapUsedMB": 42.15,
       "heapTotalMB": 68.30
     }
   }
   ```

2. **`GET /api/health/ready` (Readiness Probe)**
   Used by load balancers and deployment orchestrators. Returns `200 OK` only when the MongoDB connection is alive and capable of serving queries. Returns `503 Service Unavailable` if database connectivity is interrupted.

3. **`GET /api/health/live` (Liveness Probe)**
   Simple lightweight probe verifying that the Node.js event loop is responsive.

### Administrative Mentor Promotion (CLI Fallback)

While teachers can register directly in the UI using `TEACHER_INVITE_CODE`, administrators can also promote any existing student account to the mentor role via the bundled CLI script:
```bash
npm run promote-mentor -- <student-email>
```

---

## 10. REST API Reference

All API requests accept and return `application/json` (or `multipart/form-data` when uploading image attachments). Authenticated routes require the `token` HTTP-only cookie established during login or registration.

### Authentication Endpoints (`/api/auth`)

| Method | Endpoint | Access | Request Body | Description |
|---|---|---|---|---|
| `POST` | `/api/auth/register` | Public | `{ name, email, password, accountType, inviteCode? }` | Register a new Student or Teacher account |
| `POST` | `/api/auth/login` | Public | `{ email, password }` | Authenticate user and issue secure HTTP-only cookie |
| `GET` | `/api/auth/me` | Authenticated | None | Retrieve currently authenticated user profile |
| `POST` | `/api/auth/logout` | Authenticated | None | Clear session cookie and invalidate client state |

### Help Request Endpoints (`/api/requests`)

| Method | Endpoint | Access | Request Body | Description |
|---|---|---|---|---|
| `POST` | `/api/requests` | Student | JSON or Multipart (`topic`, `description`, `category`, `codeSnippet?`, `images?`) | Create a new help request in `waiting` state (up to 3 images, 5 MB each) |
| `GET` | `/api/requests/mine` | Student | Query: `?status=&category=&search=` | List current student's requests with queue position |
| `GET` | `/api/requests/:id` | Participant | None | Fetch single request details, attachments, and complete message log |
| `POST` | `/api/requests/:id/cancel` | Student | None | Cancel an unassigned request (only if `waiting`) |
| `GET` | `/api/requests/:id/attachments/:attachmentId` | Participant | None | Securely stream an authorized image binary from GridFS |
| `POST` | `/api/requests/:id/claim` | Mentor | None | Atomically claim a waiting request |
| `PATCH`| `/api/requests/:id/status`| Mentor | `{ status, resolutionNotes? }` | Update claimed request to `in_progress` |
| `POST` | `/api/requests/:id/messages`| Participant | JSON or Multipart (`content?`, `images?`) | Post a mentor reply or student follow-up message (up to 3 images, 5 MB each) |
| `POST` | `/api/requests/:id/close` | Student | `{ rating, comment? }` | Mark request resolved and submit 1-5 star rating |
| `POST` | `/api/requests/:id/feedback`| Student | `{ rating, comment? }` | Submit feedback for an already-resolved request |

### Queue & Mentor Workspace Endpoints (`/api/queue`)

| Method | Endpoint | Access | Request Body | Description |
|---|---|---|---|---|
| `GET` | `/api/queue` | Mentor | Query: `?category=&status=` | View active queue, waiting counts, and active mentors |
| `GET` | `/api/queue/history` | Mentor | Query: `?limit=&skip=&search=` | Access historical resolved sessions and feedback |
| `PATCH`| `/api/queue/availability`| Mentor | `{ isAvailable }` | Toggle mentor's active duty status in the lab |

---

## 11. Data Models

### User Schema (`users`)
```javascript
{
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['student', 'mentor', 'admin'], default: 'student' },
  isAvailable: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
}
```

### HelpRequest Schema (`helprequests`)
```javascript
{
  student: { type: ObjectId, ref: 'User', required: true },
  mentor: { type: ObjectId, ref: 'User', default: null },
  topic: { type: String, required: true, minlength: 2, maxlength: 100 },
  description: { type: String, required: true, minlength: 5, maxlength: 1000 },
  codeSnippet: { type: String, default: '', maxlength: 3000 },
  attachments: [
    {
      fileId: { type: ObjectId, required: true },
      filename: { type: String, required: true },
      originalName: { type: String, required: true },
      mimeType: { type: String, enum: ['image/jpeg', 'image/png', 'image/webp'], required: true },
      size: { type: Number, required: true, max: 5242880 },
      createdAt: { type: Date, default: Date.now }
    }
  ],
  category: {
    type: String,
    enum: ['dsa', 'frontend', 'backend', 'database', 'environment', 'other'],
    default: 'other'
  },
  status: {
    type: String,
    enum: ['waiting', 'claimed', 'in_progress', 'awaiting_mentor', 'awaiting_student', 'resolved', 'cancelled'],
    default: 'waiting'
  },
  messages: [
    {
      sender: { type: ObjectId, ref: 'User', required: true },
      senderRole: { type: String, enum: ['student', 'mentor'], required: true },
      senderName: { type: String, required: true },
      content: { type: String, default: '', maxlength: 2000 },
      attachments: [
        {
          fileId: { type: ObjectId, required: true },
          filename: { type: String, required: true },
          originalName: { type: String, required: true },
          mimeType: { type: String, enum: ['image/jpeg', 'image/png', 'image/webp'], required: true },
          size: { type: Number, required: true, max: 5242880 },
          createdAt: { type: Date, default: Date.now }
        }
      ],
      createdAt: { type: Date, default: Date.now }
    }
  ],
  resolutionNotes: { type: String, default: '', maxlength: 1000 },
  feedback: {
    rating: { type: Number, min: 1, max: 5 },
    comment: { type: String, default: '', maxlength: 500 },
    submittedAt: { type: Date }
  },
  claimedAt: { type: Date },
  inProgressAt: { type: Date },
  resolvedAt: { type: Date },
  cancelledAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
}
```

---

## 12. Automated Testing and Verification

LabLine includes an extensive automated integration test suite written with Node.js's native test runner (`node:test`) and `supertest`.

### Running Tests
```bash
npm test
```

### Test Coverage Highlights
- **70 Automated Test Assertions across 14 Test Suites** executing against an isolated test MongoDB database.
- **Diagnostic Probes:** Verifies 200 OK health checks and 503 unavailable responses during simulated database outages.
- **Role Enforcement & Dual Registration:** Verifies unprivileged students cannot claim requests, teacher accounts require invitation secrets, and client-supplied role tampering is discarded.
- **Concurrency & Atomic Claims:** Simulates concurrent mentor claims to verify that exactly one mentor succeeds while other attempts receive `409 Conflict`.
- **Doubt Lifecycle & Turn-Taking:** Tests full multi-turn conversations (`waiting` -> `claimed` -> `awaiting_student` -> `awaiting_mentor` -> `resolved`).
- **Student Ownership & Ratings:** Guarantees that only the student owner can close tickets and enforces valid integer ratings between 1 and 5.
- **Secure Image Attachments & GridFS Storage:** Validates MIME detection, file-size limits (5 MB), maximum 3 images per post, multi-chunk GridFS streaming, and participant-only authorization.
- **CLI Utility Tests:** Verifies the administrative mentor promotion script (`src/cli/promote-mentor.js`).

---

## License

This project was built for academic evaluation at Scaler School of Technology. All rights reserved.
