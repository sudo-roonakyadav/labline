import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { config } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { HelpRequest } from '../src/models/HelpRequest.js';
import { COOKIE_NAME } from '../src/utils/token.js';

const TEST_DB_URI = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/labline_automated_tests';

describe('LabLine Full-Stack API Test Suite', () => {
  let app;

  before(async () => {
    // Ensure test environment variables are loaded
    process.env.NODE_ENV = 'test';
    process.env.CLIENT_ORIGIN = 'http://localhost:5173';
    if (!process.env.JWT_SECRET) {
      process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long!';
    }

    // Connect to isolated test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(TEST_DB_URI);
    }
    // Clean collections before tests
    await User.deleteMany({});
    await HelpRequest.deleteMany({});

    app = createApp(process.env.CLIENT_ORIGIN);
  });

  after(async () => {
    // Clean up test collections and disconnect
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  });

  // -------------------------------------------------------------------------
  // HEALTH & READINESS PROBES
  // -------------------------------------------------------------------------
  describe('GET /api/health (Diagnostic Probe)', () => {
    test('returns operational health status and database connectivity', async () => {
      const res = await request(app).get('/api/health');
      assert.equal(res.status, 200);
      assert.equal(res.body.service, 'labline-server');
      assert.equal(res.body.database.connected, true);
      assert.equal(res.body.database.status, 'connected');
      assert.equal(res.body.realtime.status, 'operational');
    });
  });

  describe('GET /api/health/ready (Readiness Probe)', () => {
    test('returns 200 when database connection is ready', async () => {
      const res = await request(app).get('/api/health/ready');
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'ready');
      assert.equal(res.body.database, 'connected');
      assert(res.body.timestamp);
    });

    test('returns 503 unavailable when database is disconnected', async () => {
      // Temporarily disconnect to verify unready state
      await mongoose.disconnect();

      const res = await request(app).get('/api/health/ready');
      assert.equal(res.status, 503);
      assert.equal(res.body.status, 'unavailable');
      assert.equal(res.body.database, 'disconnected');
      assert.equal(res.body.error, 'Database connection is not ready.');

      // Reconnect for subsequent tests
      await mongoose.connect(TEST_DB_URI);
      const reconnectedRes = await request(app).get('/api/health/ready');
      assert.equal(reconnectedRes.status, 200);
    });
  });

  describe('Production Static Serving & Routing Behavior', () => {
    test('unknown API routes always return JSON 404, never HTML', async () => {
      const resGet = await request(app).get('/api/nonexistent-route');
      assert.equal(resGet.status, 404);
      assert(resGet.headers['content-type'].includes('application/json'));
      assert.equal(resGet.body.error, 'Not Found');

      const resPost = await request(app).post('/api/nonexistent-route');
      assert.equal(resPost.status, 404);
      assert(resPost.headers['content-type'].includes('application/json'));
      assert.equal(resPost.body.error, 'Not Found');
    });

    test('in production mode, non-API GET requests serve SPA index.html', async () => {
      const prevEnv = config.nodeEnv;
      config.nodeEnv = 'production';
      const prodApp = createApp('http://localhost:5173');

      const res = await request(prodApp).get('/some/client/route');
      assert.equal(res.status, 200);
      assert(res.headers['content-type'].includes('text/html'));
      assert(res.text.includes('<!DOCTYPE html>') || res.text.includes('<div id="root">'));

      // Ensure /api unknown still returns JSON 404 in production mode
      const apiRes = await request(prodApp).get('/api/missing-route');
      assert.equal(apiRes.status, 404);
      assert(apiRes.headers['content-type'].includes('application/json'));
      assert.equal(apiRes.body.error, 'Not Found');

      config.nodeEnv = prevEnv;
    });
  });

  // -------------------------------------------------------------------------
  // AUTHENTICATION & AUTHORIZATION
  // -------------------------------------------------------------------------
  describe('Authentication & Role Enforcement', () => {
    test('rejects registration with invalid email or short password (422)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'bad-email', name: 'A', password: '123' });

      assert.equal(res.status, 422);
      assert.equal(res.body.error, 'Unprocessable Entity');
      assert(res.body.details.length >= 2);
    });

    test('registers student account and ignores client-supplied mentor role', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'student1@scaler.com',
          name: 'Student One',
          password: 'Password123!',
          role: 'mentor', // Malicious attempt to elevate privileges
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.user.email, 'student1@scaler.com');
      assert.equal(res.body.user.name, 'Student One');
      assert.equal(res.body.user.role, 'student'); // MUST be student
      assert.equal(res.body.user.passwordHash, undefined); // Never expose hash

      // Verify cookie is set
      const cookies = res.headers['set-cookie'];
      assert(cookies);
      assert(cookies.some((c) => c.includes(COOKIE_NAME)));
    });

    test('rejects duplicate email registration (409 Conflict)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'student1@scaler.com',
          name: 'Duplicate Student',
          password: 'Password123!',
        });

      assert.equal(res.status, 409);
      assert.equal(res.body.error, 'Conflict');
    });

    test('rejects login with wrong password (401 Unauthorized)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'student1@scaler.com', password: 'WrongPassword!' });

      assert.equal(res.status, 401);
      assert.equal(res.body.error, 'Unauthorized');
    });

    test('authenticates valid credentials and retrieves session at GET /api/auth/me', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'student1@scaler.com', password: 'Password123!' });

      assert.equal(loginRes.status, 200);
      assert.equal(loginRes.body.user.email, 'student1@scaler.com');

      const cookies = loginRes.headers['set-cookie'];

      // Call /api/auth/me using the cookie
      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Cookie', cookies);

      assert.equal(meRes.status, 200);
      assert.equal(meRes.body.user.email, 'student1@scaler.com');
      assert.equal(meRes.body.user.role, 'student');
      assert(meRes.headers['cache-control'].includes('no-store'));

      // Conditional request regression test: ensure 304 is NEVER returned for session endpoint
      const conditionalRes = await request(app)
        .get('/api/auth/me')
        .set('Cookie', cookies)
        .set('If-None-Match', meRes.headers['etag'] || 'W/"arbitrary-etag"')
        .set('If-Modified-Since', new Date().toUTCString());

      assert.equal(conditionalRes.status, 200, 'Must return 200 rather than 304 for session retrieval');
      assert.equal(conditionalRes.body.user.email, 'student1@scaler.com');
      assert(conditionalRes.headers['cache-control'].includes('no-store'));
    });

    test('rejects /api/auth/me without authentication cookie (401)', async () => {
      const res = await request(app).get('/api/auth/me');
      assert.equal(res.status, 401);
      assert(res.headers['cache-control'].includes('no-store'));
    });

    test('clears session on POST /api/auth/logout', async () => {
      const res = await request(app).post('/api/auth/logout');
      assert.equal(res.status, 200);
      const cookies = res.headers['set-cookie'];
      assert(cookies.some((c) => c.includes(`${COOKIE_NAME}=;`)));
    });
  });

  // -------------------------------------------------------------------------
  // HELP REQUESTS & QUEUE WORKFLOWS
  // -------------------------------------------------------------------------
  describe('Help Requests & Queue Management', () => {
    let studentCookie;
    let student2Cookie;
    let mentorCookie;
    let mentor2Cookie;
    let studentUser;
    let student2User;
    let mentorUser;
    let mentor2User;

    before(async () => {
      // Create student 2
      const s2Res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'student2@scaler.com', name: 'Student Two', password: 'Password123!' });
      student2Cookie = s2Res.headers['set-cookie'];
      student2User = s2Res.body.user;

      // Log in student 1
      const s1Res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'student1@scaler.com', password: 'Password123!' });
      studentCookie = s1Res.headers['set-cookie'];
      studentUser = s1Res.body.user;

      // Create mentor account via registration then promote in DB
      const mRes = await request(app)
        .post('/api/auth/register')
        .send({ email: 'mentor1@scaler.com', name: 'Mentor One', password: 'Password123!' });
      mentorUser = await User.findById(mRes.body.user.id);
      mentorUser.role = 'mentor';
      await mentorUser.save();

      // Log in as mentor 1
      const mLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'mentor1@scaler.com', password: 'Password123!' });
      mentorCookie = mLogin.headers['set-cookie'];

      // Create mentor 2
      const m2Res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'mentor2@scaler.com', name: 'Mentor Two', password: 'Password123!' });
      mentor2User = await User.findById(m2Res.body.user.id);
      mentor2User.role = 'mentor';
      await mentor2User.save();

      const m2Login = await request(app)
        .post('/api/auth/login')
        .send({ email: 'mentor2@scaler.com', password: 'Password123!' });
      mentor2Cookie = m2Login.headers['set-cookie'];
    });

    test('students can create help requests with input validation', async () => {
      // Missing fields (422)
      const badRes = await request(app)
        .post('/api/requests')
        .set('Cookie', studentCookie)
        .send({ topic: '', description: '' });
      assert.equal(badRes.status, 422);

      // Valid request
      const validRes = await request(app)
        .post('/api/requests')
        .set('Cookie', studentCookie)
        .send({
          topic: 'React Hook Dependency Loop',
          description: 'useEffect causes infinite re-render loop on table data.',
          codeSnippet: 'useEffect(() => { setVal(val + 1); }, [val]);',
        });

      assert.equal(validRes.status, 201);
      assert.equal(validRes.body.request.topic, 'React Hook Dependency Loop');
      assert.equal(validRes.body.request.status, 'waiting');
      assert.equal(validRes.body.request.queuePosition, 1);
    });

    test('FIFO queue position increments for subsequent student request', async () => {
      const res = await request(app)
        .post('/api/requests')
        .set('Cookie', student2Cookie)
        .send({
          topic: 'MongoDB Connection Timeout',
          description: 'Mongoose throws connection timeout after 3000ms.',
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.request.status, 'waiting');
      assert.equal(res.body.request.queuePosition, 2);
    });

    test('student can view their own requests via GET /api/requests/mine', async () => {
      const res = await request(app)
        .get('/api/requests/mine')
        .set('Cookie', studentCookie);

      assert.equal(res.status, 200);
      assert.equal(res.body.requests.length, 1);
      assert.equal(res.body.requests[0].topic, 'React Hook Dependency Loop');
      assert.equal(res.body.requests[0].queuePosition, 1);
    });

    test('student cannot access mentor queue endpoint GET /api/queue (403 Forbidden)', async () => {
      const res = await request(app)
        .get('/api/queue')
        .set('Cookie', studentCookie);

      assert.equal(res.status, 403);
      assert.equal(res.body.error, 'Forbidden');
    });

    test('mentor can view queue with waiting requests', async () => {
      const res = await request(app)
        .get('/api/queue')
        .set('Cookie', mentorCookie);

      assert.equal(res.status, 200);
      assert.equal(res.body.queue.length, 2);
      assert.equal(res.body.queue[0].queuePosition, 1);
      assert.equal(res.body.queue[1].queuePosition, 2);
    });

    test('competing mentor claims: exactly one mentor succeeds atomically, the other receives 409', async () => {
      // Get the waiting request ID
      const queueRes = await request(app)
        .get('/api/queue')
        .set('Cookie', mentorCookie);
      const targetRequestId = queueRes.body.queue[0]._id;

      // Simulate simultaneous claim attempts
      const [claim1, claim2] = await Promise.all([
        request(app)
          .post(`/api/requests/${targetRequestId}/claim`)
          .set('Cookie', mentorCookie),
        request(app)
          .post(`/api/requests/${targetRequestId}/claim`)
          .set('Cookie', mentor2Cookie),
      ]);

      const statuses = [claim1.status, claim2.status].sort();
      assert.deepEqual(statuses, [200, 409], 'One claim must succeed (200) and one must be rejected (409)');

      // Verify the claimed request is now claimed in DB
      const updated = await HelpRequest.findById(targetRequestId);
      assert.equal(updated.status, 'claimed');
      assert(updated.mentor);
    });

    test('student cannot cancel an already claimed request (409 Conflict)', async () => {
      const mineRes = await request(app)
        .get('/api/requests/mine')
        .set('Cookie', studentCookie);
      const claimedRequestId = mineRes.body.requests[0]._id;

      const cancelRes = await request(app)
        .post(`/api/requests/${claimedRequestId}/cancel`)
        .set('Cookie', studentCookie);

      assert.equal(cancelRes.status, 409);
      assert.equal(cancelRes.body.error, 'Conflict');
    });

    test('student cannot cancel another student waiting request (403 Forbidden)', async () => {
      // student2 has request #2 waiting
      const s2Requests = await request(app)
        .get('/api/requests/mine')
        .set('Cookie', student2Cookie);
      const s2RequestId = s2Requests.body.requests[0]._id;

      // student 1 attempts to cancel student 2's request
      const cancelRes = await request(app)
        .post(`/api/requests/${s2RequestId}/cancel`)
        .set('Cookie', studentCookie);

      assert.equal(cancelRes.status, 403);
      assert.equal(cancelRes.body.error, 'Forbidden');
    });

    test('student can cancel their own waiting request', async () => {
      const s2Requests = await request(app)
        .get('/api/requests/mine')
        .set('Cookie', student2Cookie);
      const s2RequestId = s2Requests.body.requests[0]._id;

      const cancelRes = await request(app)
        .post(`/api/requests/${s2RequestId}/cancel`)
        .set('Cookie', student2Cookie);

      assert.equal(cancelRes.status, 200);
      assert.equal(cancelRes.body.request.status, 'cancelled');

      // Verify status in DB
      const doc = await HelpRequest.findById(s2RequestId);
      assert.equal(doc.status, 'cancelled');
    });

    test('status transitions: mentor moves claimed -> in_progress -> resolved; invalid transitions fail', async () => {
      // Find the claimed request
      const claimedDoc = await HelpRequest.findOne({ status: 'claimed' });
      assert(claimedDoc);

      // Determine which mentor claimed it
      const claimingMentorCookie =
        claimedDoc.mentor.toString() === mentorUser._id.toString()
          ? mentorCookie
          : mentor2Cookie;
      const otherMentorCookie =
        claimedDoc.mentor.toString() === mentorUser._id.toString()
          ? mentor2Cookie
          : mentorCookie;

      // Unassigned mentor attempts update (403 Forbidden)
      const unassignedRes = await request(app)
        .patch(`/api/requests/${claimedDoc._id}/status`)
        .set('Cookie', otherMentorCookie)
        .send({ status: 'in_progress' });
      assert.equal(unassignedRes.status, 403);

      // Invalid jump: claimed -> resolved directly (409 Conflict)
      const invalidJumpRes = await request(app)
        .patch(`/api/requests/${claimedDoc._id}/status`)
        .set('Cookie', claimingMentorCookie)
        .send({ status: 'resolved' });
      assert.equal(invalidJumpRes.status, 409);

      // Valid transition: claimed -> in_progress
      const inProgressRes = await request(app)
        .patch(`/api/requests/${claimedDoc._id}/status`)
        .set('Cookie', claimingMentorCookie)
        .send({ status: 'in_progress' });
      assert.equal(inProgressRes.status, 200);
      assert.equal(inProgressRes.body.request.status, 'in_progress');

      // Valid transition: in_progress -> resolved
      const resolvedRes = await request(app)
        .patch(`/api/requests/${claimedDoc._id}/status`)
        .set('Cookie', claimingMentorCookie)
        .send({ status: 'resolved' });
      assert.equal(resolvedRes.status, 200);
      assert.equal(resolvedRes.body.request.status, 'resolved');

      // Attempting to move resolved request again (409 Conflict)
      const closedRes = await request(app)
        .patch(`/api/requests/${claimedDoc._id}/status`)
        .set('Cookie', claimingMentorCookie)
        .send({ status: 'in_progress' });
      assert.equal(closedRes.status, 409);
    });
  });

  // -------------------------------------------------------------------------
  // QUEUE INTELLIGENCE, CATEGORIES, AVAILABILITY & SESSION OUTCOMES
  // -------------------------------------------------------------------------
  describe('Queue Intelligence, Categories, Availability & Session Outcomes', () => {
    let studentCookie;
    let studentUser;
    let otherStudentCookie;
    let mentorCookie;
    let mentorUser;

    before(async () => {
      // Create student
      const sRes = await request(app)
        .post('/api/auth/register')
        .send({ email: 'cat_student@scaler.com', name: 'Cat Student', password: 'Password123!' });
      studentCookie = sRes.headers['set-cookie'];
      studentUser = sRes.body.user;

      // Create other student
      const osRes = await request(app)
        .post('/api/auth/register')
        .send({ email: 'other_student@scaler.com', name: 'Other Student', password: 'Password123!' });
      otherStudentCookie = osRes.headers['set-cookie'];

      // Create mentor
      const mRes = await request(app)
        .post('/api/auth/register')
        .send({ email: 'cat_mentor@scaler.com', name: 'Cat Mentor', password: 'Password123!' });
      mentorUser = await User.findById(mRes.body.user.id);
      mentorUser.role = 'mentor';
      mentorUser.isAvailable = true;
      await mentorUser.save();

      const mLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'cat_mentor@scaler.com', password: 'Password123!' });
      mentorCookie = mLogin.headers['set-cookie'];
    });

    test('validates request category and defaults to "other" when unspecified', async () => {
      // Invalid category rejected with 422
      const badCatRes = await request(app)
        .post('/api/requests')
        .set('Cookie', studentCookie)
        .send({
          topic: 'Bad Category Test',
          description: 'Testing validation error handling for invalid category.',
          category: 'invalid_category_123',
        });
      assert.equal(badCatRes.status, 422);
      assert.equal(badCatRes.body.error, 'Unprocessable Entity');

      // Valid specific category
      const validCatRes = await request(app)
        .post('/api/requests')
        .set('Cookie', studentCookie)
        .send({
          topic: 'CSS Flexbox Alignment Issue',
          description: 'Sub-items are not wrapping correctly in Firefox layout.',
          category: 'frontend',
        });
      assert.equal(validCatRes.status, 201);
      assert.equal(validCatRes.body.request.category, 'frontend');

      // Default category fallback
      const defaultCatRes = await request(app)
        .post('/api/requests')
        .set('Cookie', studentCookie)
        .send({
          topic: 'General Discussion',
          description: 'General architectural discussion on queue design patterns.',
        });
      assert.equal(defaultCatRes.status, 201);
      assert.equal(defaultCatRes.body.request.category, 'other');
    });

    test('mentor queue category filtering preserves strict FIFO ordering within category', async () => {
      // Clear waiting requests for deterministic queue check
      await HelpRequest.deleteMany({ status: 'waiting' });

      // Create requests with distinct categories
      await request(app)
        .post('/api/requests')
        .set('Cookie', studentCookie)
        .send({
          topic: 'Backend Session Auth Issue',
          description: 'Express session cookies are rejected across subdomains.',
          category: 'backend',
        });

      const fe1Res = await request(app)
        .post('/api/requests')
        .set('Cookie', studentCookie)
        .send({
          topic: 'Vite Proxy Setup Error',
          description: 'Proxy configuration does not rewrite websocket headers.',
          category: 'frontend',
        });

      const fe2Res = await request(app)
        .post('/api/requests')
        .set('Cookie', studentCookie)
        .send({
          topic: 'React SVG Wave Rendering',
          description: 'Smooth SVG cubic beziers jitter during keyframe updates.',
          category: 'frontend',
        });

      // Filter by category=frontend
      const feQueueRes = await request(app)
        .get('/api/queue?category=frontend')
        .set('Cookie', mentorCookie);

      assert.equal(feQueueRes.status, 200);
      assert.equal(feQueueRes.body.queue.length, 2);
      assert.equal(feQueueRes.body.queue[0]._id, fe1Res.body.request._id);
      assert.equal(feQueueRes.body.queue[1]._id, fe2Res.body.request._id);
      assert.equal(feQueueRes.body.activeFilter.category, 'frontend');
    });

    test('mentor supplies structured resolution notes upon closing session', async () => {
      const waitDoc = await HelpRequest.findOne({ status: 'waiting', category: 'frontend' });
      assert(waitDoc);

      // Claim
      await request(app)
        .post(`/api/requests/${waitDoc._id}/claim`)
        .set('Cookie', mentorCookie);

      // Transition to in_progress
      await request(app)
        .patch(`/api/requests/${waitDoc._id}/status`)
        .set('Cookie', mentorCookie)
        .send({ status: 'in_progress' });

      // Reject overlong resolution notes (> 1000 chars)
      const longNotes = 'x'.repeat(1001);
      const badNotesRes = await request(app)
        .patch(`/api/requests/${waitDoc._id}/status`)
        .set('Cookie', mentorCookie)
        .send({ status: 'resolved', resolutionNotes: longNotes });
      assert.equal(badNotesRes.status, 422);

      // Transition to resolved with valid resolution notes
      const resolveRes = await request(app)
        .patch(`/api/requests/${waitDoc._id}/status`)
        .set('Cookie', mentorCookie)
        .send({
          status: 'resolved',
          resolutionNotes: 'Configured Vite proxy ws: true option in vite.config.js to support upgrade headers.',
        });

      assert.equal(resolveRes.status, 200);
      assert.equal(resolveRes.body.request.status, 'resolved');
      assert.equal(
        resolveRes.body.request.resolutionNotes,
        'Configured Vite proxy ws: true option in vite.config.js to support upgrade headers.'
      );
      assert(resolveRes.body.request.resolvedAt);
    });

    test('student submits verified feedback with rating and comment for resolved session', async () => {
      const resolvedDoc = await HelpRequest.findOne({
        status: 'resolved',
        student: studentUser.id,
      });
      assert(resolvedDoc);

      // Invalid rating (out of bounds)
      const badRatingRes = await request(app)
        .post(`/api/requests/${resolvedDoc._id}/feedback`)
        .set('Cookie', studentCookie)
        .send({ rating: 6, comment: 'Too high' });
      assert.equal(badRatingRes.status, 422);

      // Non-owner student rejected (403)
      const wrongStudentRes = await request(app)
        .post(`/api/requests/${resolvedDoc._id}/feedback`)
        .set('Cookie', otherStudentCookie)
        .send({ rating: 5, comment: 'Sneaky rating' });
      assert.equal(wrongStudentRes.status, 403);

      // Valid feedback submission
      const validFeedbackRes = await request(app)
        .post(`/api/requests/${resolvedDoc._id}/feedback`)
        .set('Cookie', studentCookie)
        .send({
          rating: 5,
          comment: 'Resolved quickly with clear explanation of Vite websocket proxies.',
        });

      assert.equal(validFeedbackRes.status, 200);
      assert.equal(validFeedbackRes.body.request.feedback.rating, 5);
      assert.equal(
        validFeedbackRes.body.request.feedback.comment,
        'Resolved quickly with clear explanation of Vite websocket proxies.'
      );
      assert(validFeedbackRes.body.request.feedback.submittedAt);

      // Prevent duplicate feedback submission (409 Conflict)
      const duplicateRes = await request(app)
        .post(`/api/requests/${resolvedDoc._id}/feedback`)
        .set('Cookie', studentCookie)
        .send({ rating: 4, comment: 'Attempting to overwrite' });
      assert.equal(duplicateRes.status, 409);
    });

    test('feedback rejected if request is not in resolved state (409 Conflict)', async () => {
      // Find a waiting request
      const waitingDoc = await HelpRequest.findOne({
        status: 'waiting',
        student: studentUser.id,
      });
      assert(waitingDoc);

      const res = await request(app)
        .post(`/api/requests/${waitingDoc._id}/feedback`)
        .set('Cookie', studentCookie)
        .send({ rating: 5, comment: 'Premature feedback' });

      assert.equal(res.status, 409);
      assert.equal(res.body.error, 'Conflict');
    });

    test('mentor availability toggle via PATCH /api/queue/availability', async () => {
      // Student cannot toggle availability (403)
      const studentAttempt = await request(app)
        .patch('/api/queue/availability')
        .set('Cookie', studentCookie)
        .send({ isAvailable: false });
      assert.equal(studentAttempt.status, 403);

      // Non-boolean value rejected (422)
      const badTypeRes = await request(app)
        .patch('/api/queue/availability')
        .set('Cookie', mentorCookie)
        .send({ isAvailable: 'not-a-bool' });
      assert.equal(badTypeRes.status, 422);

      // Mentor sets isAvailable to false
      const setOffRes = await request(app)
        .patch('/api/queue/availability')
        .set('Cookie', mentorCookie)
        .send({ isAvailable: false });
      assert.equal(setOffRes.status, 200);
      assert.equal(setOffRes.body.user.isAvailable, false);

      // Mentor restores availability to true
      const setOnRes = await request(app)
        .patch('/api/queue/availability')
        .set('Cookie', mentorCookie)
        .send({ isAvailable: true });
      assert.equal(setOnRes.status, 200);
      assert.equal(setOnRes.body.user.isAvailable, true);
    });

    test('queue history returns resolved requests with resolution notes and feedback', async () => {
      const historyRes = await request(app)
        .get('/api/queue/history')
        .set('Cookie', mentorCookie);

      assert.equal(historyRes.status, 200);
      assert(Array.isArray(historyRes.body.history));
      assert(historyRes.body.history.length >= 1);
      const sample = historyRes.body.history[0];
      assert.equal(sample.status, 'resolved');
      assert(sample.resolutionNotes);
    });

    test('queue intelligence provides telemetry and honest estimation thresholding', async () => {
      const intelRes = await request(app).get('/api/queue/intelligence');
      assert.equal(intelRes.status, 200);
      assert(typeof intelRes.body.waitingCount === 'number');
      assert(typeof intelRes.body.availableMentors === 'number');
      assert(['insufficient_data', 'no_mentors_available', 'moderate', 'high'].includes(intelRes.body.confidence));

      // Check student /mine endpoint also returns intelligence
      const mineRes = await request(app)
        .get('/api/requests/mine')
        .set('Cookie', studentCookie);
      assert.equal(mineRes.status, 200);
      const waitingReq = mineRes.body.requests.find((r) => r.status === 'waiting');
      if (waitingReq) {
        assert(waitingReq.intelligence);
        assert(['insufficient_data', 'no_mentors_available', 'moderate', 'high'].includes(waitingReq.intelligence.confidence));
      }
    });
  });
});
