# LabLine — Official 3 to 5 Minute Demo Video Script & Walkthrough

This document provides the complete, timed narration script, screen recording guide, setup checklist, and official submission metadata for the LabLine End-Term Project demonstration.

---

## 1. Official Submission Information Block

Copy and paste this exact block into the Scaler School of Technology Final Submission Form at **[https://forms.gle/sBy4sfqyiRG2Zpom9](https://forms.gle/sBy4sfqyiRG2Zpom9)**:

```text
Project Name: LabLine

Student Name: Ronak Yadav

Problem Statement:
University computer science laboratories suffer from chaotic hand-raising, invisible queues, mentor starvation, and complete lack of code context when seeking help. Generic ticketing systems fail because mentors prematurely close tickets without verification. LabLine solves this with real-time FIFO queue scheduling, atomic ticket claiming to eliminate race conditions, interactive in-session discussions with formatted code snippets, and student-exclusive session closure with mandatory 1-to-5 star ratings.

GitHub Repository:
https://github.com/sudo-roonakyadav/labline

Deployed Application / Build:
https://labline.onrender.com

Demo Video:
[INSERT YOUR PUBLIC 3-5 MINUTE VIDEO URL HERE - e.g. Loom, YouTube, or Google Drive]

Tech Stack:
React 18, Vite, Custom Scoped CSS (SIGNAL Design System), Node.js (v20+), Express.js, Socket.IO, MongoDB Atlas, Mongoose, Render Cloud (Singapore)

Major Features:
1. Dual-Role Registration: Dedicated Student and Teacher onboarding with server-validated invitation security.
2. Real-Time FIFO Queue: Dynamic position tracking and velocity-based wait time estimation via Socket.IO.
3. Atomic Mentor Claiming: Race-condition-free ticket claiming via MongoDB atomic operators.
4. Interactive Doubt Discussions: Structured multi-turn technical conversation with state indicators (awaiting_student, awaiting_mentor) and formatted code snippets.
5. Student-Controlled Session Closure: Only the student can resolve and submit verified 1-5 star ratings; mentors cannot close tickets.
6. Mentor Availability & Queue Intelligence: Triage filtering across categories (DSA, Frontend, Backend, Database, Environment) with active-mentor capacity tracking.
7. Cloud-Native Health Probes: Production diagnostics and Kubernetes-style readiness checks (/api/health, /api/health/ready).
```

---

## 2. Pre-Recording Preparation Checklist

Before recording your screen with OBS Studio, Loom, or macOS Screen Recorder:

- [ ] **Dual Window Setup:** Open two separate browser windows side-by-side on your desktop:
  - **Left Window (50% screen width):** Normal browser window navigated to `https://labline.onrender.com`. This will be your **Student Workspace**.
  - **Right Window (50% screen width):** Incognito or separate browser profile window navigated to `https://labline.onrender.com`. This will be your **Teacher/Mentor Workspace**.
- [ ] **Accounts Ready:**
  - Student: `student.demo@college.edu` / `Password123!` (or register live in 10 seconds).
  - Teacher: `mentor.demo@college.edu` / `Password123!` (logged in and ready, with availability set to "Available").
- [ ] **Microphone & Audio:** Test audio levels; speak clearly with a brisk, professional cadence.
- [ ] **Browser Zoom:** Set zoom to 100% or 110% so text and code snippets are crisp and legible.
- [ ] **Target Timing:** 3 minutes 45 seconds to 4 minutes 30 seconds (safely within the 3–5 minute guideline).

---

## 3. Minute-by-Minute Demo Script

### Segment 1: The Problem & Product Overview (0:00 – 0:45)
- **Visual:** Left window displays the LabLine landing page at `https://labline.onrender.com`. Scroll smoothly across the hero section, the live telemetry visualizer, and the architecture overview.
- **Narration:**
  > "Hello everyone. My name is Ronak Yadav, and today I am demonstrating LabLine, a real-time laboratory coordination and doubt resolution platform built for university computer science labs.
  >
  > In practical lab sessions, students typically raise hands or shout across crowded rooms. Mentors don't know who asked first, two mentors often approach the same desk, and students have to spend five minutes re-explaining their bug without code context.
  >
  > LabLine solves this with an engineering-grade real-time web application featuring transparent FIFO queueing, atomic ticket claiming, interactive multi-turn code discussions, and student-controlled session closure. Let's see it in action."

---

### Segment 2: Dual Registration & Student Doubt Submission (0:45 – 1:30)
- **Visual:** Click "Register" on the left window. Show the account selection modal (Student vs Teacher). Select "Student" and log in or register `student.demo@college.edu`. The Student Workspace loads.
- **Action:** Fill out the doubt submission form:
  - Topic: `Segmentation fault in binary tree destructor`
  - Category: `dsa`
  - Description: `My recursive post-order destructor hits a null pointer on leaf nodes.`
  - Code Snippet:
    ```cpp
    void ~Tree() {
      delete left;
      delete right;
    }
    ```
  - Click "Submit Help Request".
- **Narration:**
  > "LabLine features dual registration with distinct student and faculty onboarding. Teacher accounts are secured by a server-side cryptographic invitation key to prevent unauthorized privilege escalation.
  >
  > Here in the student workspace, I am submitting a Data Structures doubt along with a C++ code snippet. Notice what happens the moment I click Submit:
  >
  > Immediately, the request is placed into our FIFO queue. The student sees their exact queue position—Position #1—along with dynamic wait time estimation computed from recent resolution velocities."

---

### Segment 3: Real-Time Synchronization & Atomic Claiming (1:30 – 2:20)
- **Visual:** Direct the evaluator's attention to the right window (Mentor Workspace). Notice that without refreshing the page, the newly submitted doubt appeared instantly via WebSockets.
- **Action:**
  - Point out the category badge (`DSA`), student name, timestamp, and the code preview.
  - In the mentor workspace, click "Claim Doubt".
  - Instantly show the left student window transition from "Waiting in Queue" to "Mentor Assigned: Prof Sneha Desai".
- **Narration:**
  > "On the right window, we see the mentor workspace. Notice that the mentor did not have to reload or poll. Socket.IO immediately broadcasted the queue change.
  >
  > When multiple teaching assistants are on duty, race conditions can occur if two mentors click Claim at the same millisecond. LabLine eliminates this using an atomic MongoDB `findOneAndUpdate` operation. Exactly one mentor succeeds, and any competing mentor receives a conflict response.
  >
  > As soon as the mentor claims the ticket, both screens synchronize into an active collaboration workspace."

---

### Segment 4: Interactive Discussion & State Machine Turn-Taking (2:20 – 3:15)
- **Visual:** In the right window (Mentor Workspace), the mentor reviews the code snippet and sends a response.
- **Action:**
  - Mentor posts: `Check whether left and right are null before calling delete, or set deleted pointers to nullptr.`
  - Left window receives the message in real-time. Notice the status badge switches to `Awaiting Student Response`.
  - In the left window, student replies: `Added if (left) delete left; works now for the root, but crashing on cycle.`
  - Status updates to `Awaiting Mentor Response`.
  - Mentor replies with resolution advice: `Binary trees cannot contain cycles. Check your insert logic to ensure an acyclic DAG.`
- **Narration:**
  > "Now both participants are in an active technical discussion. The mentor can inspect the formatted code snippet with syntax styling and post targeted guidance.
  >
  > Notice the status indicators: LabLine implements an explicit turn-taking finite state machine. When the mentor replies, the ticket marks 'Awaiting Student Response'. When the student asks a follow-up, it transitions to 'Awaiting Mentor'.
  >
  > Messages are validated server-side, sanitized against injection, and streamed with low latency across our WebSockets gateway."

---

### Segment 5: Student-Controlled Closure & 5-Star Rating (3:15 – 3:55)
- **Visual:** Focus on the left window (Student). Point out that the mentor workspace has NO "Close Ticket" button.
- **Action:**
  - In the student window, click "Mark Resolved & Submit Feedback".
  - Select 5 Stars and enter feedback: `Excellent explanation of tree cycles and pointer cleanup!`
  - Click "Submit & Close Session".
  - Show the session moving into historical archives on both screens with the 5-star rating prominently displayed.
- **Narration:**
  > "Here is a crucial design decision in LabLine: Mentors are strictly forbidden from closing tickets. In university labs, teaching assistants often prematurely close tickets before the student has actually verified that their code compiles.
  >
  > Only the student who originated the doubt has the authority to close the session. The student provides a required 1-to-5 star rating and feedback comment.
  >
  > Once submitted, the session is archived in MongoDB with full timestamps, resolution notes, and feedback data available for departmental review."

---

### Segment 6: Production Health Probes & Conclusion (3:55 – 4:30)
- **Visual:** Open a new tab and navigate to `https://labline.onrender.com/api/health`. Show the JSON output containing database latency, socket connection counts, uptime, and memory usage.
- **Narration:**
  > "Finally, LabLine is built with production-grade cloud observability. Navigating to `/api/health`, we see our real-time diagnostic probe reporting MongoDB Atlas connection health, active socket counts, and system metrics. We also maintain `/api/health/ready` for automated Kubernetes and Render readiness checks.
  >
  > Our repository contains 51 automated integration tests, zero console errors, clean responsive styling down to mobile viewports, and complete documentation.
  >
  > Thank you for your time, and I look forward to your evaluation."

---

## 4. Post-Recording Review Checklist

Before uploading the video to Loom, YouTube (Unlisted), or Google Drive:

1. **Duration:** Confirm total video duration is between **3:00 and 5:00 minutes**.
2. **Audio Check:** Confirm voice is audible, clear, and without distracting background noise.
3. **Visibility:** Confirm text in both browser windows is crisp at 720p/1080p.
4. **Access Permissions:**
   - If using Google Drive: Set share settings to **"Anyone with the link can view"**.
   - If using YouTube: Set to **"Unlisted"** or **"Public"**.
   - If using Loom: Ensure public link sharing is enabled.
5. **Incognito Test:** Open the link in a private/incognito window to verify it plays without requiring a login or permission request.
6. **Form Submission:** Paste the link into the official submission form at `https://forms.gle/sBy4sfqyiRG2Zpom9` along with the metadata block from Section 1 above.
