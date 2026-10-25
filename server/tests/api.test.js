import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
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
  // HEALTH CHECK
  // -------------------------------------------------------------------------
  describe('GET /api/health', () => {
    test('returns operational health status and database connectivity', async () => {
      const res = await request(app).get('/api/health');
      assert.equal(res.status, 200);
      assert.equal(res.body.service, 'labline-server');
      assert.equal(res.body.database.connected, true);
      assert.equal(res.body.database.status, 'connected');
      assert.equal(res.body.realtime.status, 'operational');
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
    });

    test('rejects /api/auth/me without authentication cookie (401)', async () => {
      const res = await request(app).get('/api/auth/me');
      assert.equal(res.status, 401);
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
});
