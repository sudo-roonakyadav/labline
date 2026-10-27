# LabLine — Official Guided Demo Video Script & Walkthrough

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
- [ ] **Target Timing:** 3 to 4 minutes (fits comfortably within the 2-minute concise or 3–5 minute full guideline).

---

## 3. Minute-by-Minute Guided Demo Script

The demonstration follows the exact narrative order of the landing page:
**Why LabLine is needed &rarr; What students and mentors can do &rarr; How a doubt progresses &rarr; System implementation &rarr; Live dual-workspace execution.**

---

### Step 1: Homepage & Problem Introduction (0:00 – 0:35)
- **Visual:** Left window shows the LabLine homepage at `https://labline.onrender.com`. Cursor points to top header and wordmark.
- **Action:** Click `01 // PROBLEM` in the navigation bar. The page scrolls smoothly to the problem section.
- **Narration:**
  > "Hello everyone. My name is Ronak Yadav, and today I am presenting LabLine, a real-time laboratory coordination and doubt resolution platform built for college computer science labs.
  >
  > In an 80-student lab, informal help queues fail. Physical hand-raising and room call-outs reward loudness over fairness: aggressive students jump ahead, while quiet students wait unassisted. Without coordination, mentors blindly walk to the same desks simultaneously, and when help does arrive, precious time is wasted reconstructing context from memory. LabLine was engineered to fix this."

---

### Step 2: Workflows & Workspaces Overview (0:35 – 1:00)
- **Action:** Click `02 // WORKFLOWS` in the navigation bar. The page scrolls to the two workspace cards.
- **Narration:**
  > "Clicking into Workflows, LabLine provides two specialized workspaces synchronized by one real-time queue.
  >
  > In the Student Workspace, students submit doubts with category tagging and code snippets, see their exact FIFO position, and continue interactive discussions until their doubt is truly solved.
  >
  > In the Mentor Dashboard, faculty and teaching assistants get an orderly real-time feed, atomic ticket claiming to prevent race conditions, and live conversation triage."

---

### Step 3: Lifecycle State Machine (1:00 – 1:25)
- **Action:** Click `03 // LIFECYCLE` in the navigation bar. Show the interactive five-stage visualizer.
- **Narration:**
  > "Under Lifecycle, every student blocker advances through a deterministic five-stage state machine:
  >
  > Submission, where input is validated and sanitized; FIFO Queue, with velocity-based wait time estimation; Acceptance, where a mentor claims the ticket atomically; Ongoing Conversation, with explicit turn-taking; and finally Student Closure and Rating, where only the student has the authority to resolve the ticket and submit verified 1-to-5 star feedback."

---

### Step 4: System Specifications & Architecture (1:25 – 1:45)
- **Action:** Click `04 // SPECS` in the navigation bar. Show the technical subsystem table.
- **Narration:**
  > "Under System Specs, LabLine runs on a robust production stack deployed in Singapore: Socket.IO for sub-50ms real-time broadcasts, MongoDB Atlas with compound FIFO indices, stateless JWT sessions in secure HttpOnly cookies, and atomic `findOneAndUpdate` queries for strict mutual exclusion with 409 conflict protection."

---

### Step 5: Live Student Doubt Submission (1:45 – 2:25)
- **Action:** On the left window, click "Register" or "Sign In". Sign in as a student (`student.demo@college.edu`).
- **Action:** Submit a new doubt:
  - Topic: `Segmentation fault in binary tree destructor`
  - Category: `dsa`
  - Description: `Recursive destructor crashes when deleting circular tree pointers.`
  - Code Snippet:
    ```cpp
    void ~Tree() {
      delete left;
      delete right;
    }
    ```
  - Click "Submit Help Request".
- **Narration:**
  > "Now let's see the live application. Signing in as a student, I submit a Data Structures doubt along with a C++ destructor snippet.
  >
  > The instant I submit, the request enters our FIFO queue. The student immediately sees their queue position—Position #1—and dynamic wait estimation computed from recent resolution velocities."

---

### Step 6: Mentor Acceptance & Real-Time Sync (2:25 – 2:55)
- **Visual:** Focus on the right window (Mentor Workspace, `mentor.demo@college.edu`).
- **Action:**
  - Notice the newly submitted doubt appeared instantly via WebSockets without page reload.
  - In the mentor workspace, click "Claim Doubt".
  - Show both windows immediately update: the student window transitions to "Mentor Assigned: Prof Sneha Desai".
  - Mentor posts a reply: `Check if pointers are null before delete, and ensure no cycles in the destructor.`
- **Narration:**
  > "On the right window, the mentor workspace updated instantly via WebSockets.
  >
  > When I click 'Claim Doubt', MongoDB executes an atomic lock. Exactly one mentor claims the ticket, preventing any competing claim.
  >
  > The mentor reviews the formatted code snippet and posts an initial reply. Notice the real-time status switches to 'Awaiting Student Response'."

---

### Step 7: Student Follow-up, Verification & Closure (2:55 – 3:35)
- **Visual:** Left window receives the message in real-time.
- **Action:**
  - Student posts a follow-up: `Added nullptr checks, resolved root destructor, but cycle remains.`
  - Mentor posts resolution: `Binary trees cannot contain cycles. Ensure your insert method prevents cyclic edges.`
  - On the left window, student clicks "Mark Resolved & Submit Feedback".
  - Select 5 Stars and enter feedback: `Clear explanation of pointer safety and cycle prevention!`
  - Click "Submit & Close Session".
  - Show the resolved session in history on both screens with the 5-star rating.
- **Narration:**
  > "The student receives the mentor's reply in real-time, tests the advice, and posts a follow-up question.
  >
  > Notice a critical architectural rule: mentors cannot close tickets. In real labs, mentors often mark tickets closed prematurely. In LabLine, only the student who asked the question can confirm resolution.
  >
  > The student rates the interaction 5 stars and submits feedback. The session is archived with full discussion logs and metrics."

---

### Step 8: Cloud Health Probes & Conclusion (3:35 – 4:00)
- **Action:** Open `https://labline.onrender.com/api/health` in a browser tab to show the live health probe.
- **Narration:**
  > "To verify production health, `/api/health` reports our live service uptime, MongoDB Atlas ping, and active WebSockets count.
  >
  > LabLine includes 51 automated integration tests, zero console errors, responsive design down to mobile viewports, and complete documentation.
  >
  > Thank you, and I look forward to your evaluation."

---

## 4. Post-Recording Review Checklist

Before uploading the video to Loom, YouTube (Unlisted), or Google Drive:

1. **Order Verified:** Confirm the presentation followed:
   - Homepage intro &rarr; `01 // PROBLEM` &rarr; `02 // WORKFLOWS` &rarr; `03 // LIFECYCLE` &rarr; `04 // SPECS` &rarr; Live dual-role demo.
2. **Timing:** Total video duration between **3:00 and 4:30 minutes**.
3. **Audio Quality:** Clear, audible voice with zero background distortion.
4. **Link Permissions:** Ensure link sharing is set to **"Anyone with the link can view"** (Google Drive) or **"Unlisted / Public"** (YouTube / Loom).
5. **Incognito Test:** Open link in a private window to verify it plays without asking for login credentials.
6. **Form Submission:** Paste link and metadata into **[https://forms.gle/sBy4sfqyiRG2Zpom9](https://forms.gle/sBy4sfqyiRG2Zpom9)** before 11:59 PM IST, 27 October 2026.
