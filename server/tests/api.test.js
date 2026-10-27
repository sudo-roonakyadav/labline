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
  // DUAL REGISTRATION & TEACHER INVITATION FLOW
  // -------------------------------------------------------------------------
  describe('Dual Registration & Teacher Invitation Flow', () => {
    const TEST_TEACHER_CODE = 'LL-TEST-INVITE-SECURE-KEY-440';
    let prevConfigCode;
    let prevEnvCode;

    before(() => {
      prevConfigCode = config.teacherInviteCode;
      prevEnvCode = process.env.TEACHER_INVITE_CODE;
      config.teacherInviteCode = TEST_TEACHER_CODE;
      process.env.TEACHER_INVITE_CODE = TEST_TEACHER_CODE;
    });

    after(() => {
      config.teacherInviteCode = prevConfigCode;
      process.env.TEACHER_INVITE_CODE = prevEnvCode;
    });

    test('1. Student registration works without an invitation code', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'student.explicit@scaler.com',
          name: 'Explicit Student',
          password: 'Password123!',
          accountType: 'student',
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.user.email, 'student.explicit@scaler.com');
      assert.equal(res.body.user.role, 'student');
      assert.equal(res.body.user.passwordHash, undefined);
    });

    test('2. Omitting accountType continues to default to student', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'student.omitted@scaler.com',
          name: 'Omitted Type Student',
          password: 'Password123!',
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.user.email, 'student.omitted@scaler.com');
      assert.equal(res.body.user.role, 'student');
    });

    test('3. Sending role: "mentor" without a valid teacher invitation creates no privileged account', async () => {
      // 3A: accountType student with role: mentor -> created as student
      const resStudent = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'sneaky.student@scaler.com',
          name: 'Sneaky Student',
          password: 'Password123!',
          accountType: 'student',
          role: 'mentor',
        });
      assert.equal(resStudent.status, 201);
      assert.equal(resStudent.body.user.role, 'student');

      // 3B: accountType omitted with role: mentor -> created as student
      const resOmitted = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'sneaky.omitted@scaler.com',
          name: 'Sneaky Omitted',
          password: 'Password123!',
          role: 'mentor',
        });
      assert.equal(resOmitted.status, 201);
      assert.equal(resOmitted.body.user.role, 'student');

      // 3C: accountType teacher with wrong code and role: mentor -> rejected with 403
      const resTeacherFake = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'sneaky.teacher@scaler.com',
          name: 'Sneaky Teacher',
          password: 'Password123!',
          accountType: 'teacher',
          inviteCode: 'WRONG_INVITE_CODE',
          role: 'mentor',
        });
      assert.equal(resTeacherFake.status, 403);
      assert.equal(resTeacherFake.body.error, 'Forbidden');
      const foundInDb = await User.findOne({ email: 'sneaky.teacher@scaler.com' });
      assert.equal(foundInDb, null, 'User must not be created on failed invitation');
    });

    test('4. Valid teacher invitation creates an account with internal role "mentor"', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'prof.smith@scaler.com',
          name: 'Professor Smith',
          password: 'Password123!',
          accountType: 'teacher',
          inviteCode: TEST_TEACHER_CODE,
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.user.email, 'prof.smith@scaler.com');
      assert.equal(res.body.user.name, 'Professor Smith');
      assert.equal(res.body.user.role, 'mentor');
      assert.equal(res.body.user.passwordHash, undefined);
    });

    test('5. Missing or invalid teacher code is rejected', async () => {
      // 5A: Missing inviteCode
      const resMissing = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'teacher.missing.code@scaler.com',
          name: 'Teacher Missing',
          password: 'Password123!',
          accountType: 'teacher',
        });
      assert.equal(resMissing.status, 422);
      assert.equal(resMissing.body.error, 'Unprocessable Entity');
      assert(resMissing.body.details.some((d) => d.includes('invitation code is required')));

      // 5B: Empty string inviteCode
      const resEmpty = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'teacher.empty.code@scaler.com',
          name: 'Teacher Empty',
          password: 'Password123!',
          accountType: 'teacher',
          inviteCode: '   ',
        });
      assert.equal(resEmpty.status, 422);

      // 5C: Invalid inviteCode (different length)
      const resInvalidLen = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'teacher.invalid@scaler.com',
          name: 'Teacher Invalid',
          password: 'Password123!',
          accountType: 'teacher',
          inviteCode: 'SHORT',
        });
      assert.equal(resInvalidLen.status, 403);
      assert.equal(resInvalidLen.body.error, 'Forbidden');

      // 5D: Invalid inviteCode (same length, different characters)
      const tamperedCode = TEST_TEACHER_CODE.slice(0, -1) + (TEST_TEACHER_CODE.endsWith('A') ? 'B' : 'A');
      const resTampered = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'teacher.tampered@scaler.com',
          name: 'Teacher Tampered',
          password: 'Password123!',
          accountType: 'teacher',
          inviteCode: tamperedCode,
        });
      assert.equal(resTampered.status, 403);
      assert.equal(resTampered.body.error, 'Forbidden');
    });

    test('6. Teacher registration with no server-side invitation configured is rejected', async () => {
      // Temporarily clear configured code
      config.teacherInviteCode = '';
      process.env.TEACHER_INVITE_CODE = '';

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'teacher.unconfigured@scaler.com',
          name: 'Teacher Unconfigured',
          password: 'Password123!',
          accountType: 'teacher',
          inviteCode: TEST_TEACHER_CODE,
        });

      assert.equal(res.status, 503);
      assert.equal(res.body.error, 'Service Unavailable');
      assert(res.body.message.includes('not configured'));

      // Restore configured code
      config.teacherInviteCode = TEST_TEACHER_CODE;
      process.env.TEACHER_INVITE_CODE = TEST_TEACHER_CODE;
    });

    test('7. Unsupported account types are rejected', async () => {
      const invalidTypes = ['admin', 'mentor', 'superuser', 'moderator'];
      for (const badType of invalidTypes) {
        const res = await request(app)
          .post('/api/auth/register')
          .send({
            email: `badtype_${badType}@scaler.com`,
            name: 'Bad Type User',
            password: 'Password123!',
            accountType: badType,
          });
        assert.equal(res.status, 422, `Expected 422 for accountType: ${badType}`);
        assert.equal(res.body.error, 'Unprocessable Entity');
        assert(res.body.details.some((d) => d.includes('Account type must be either "student" or "teacher"')));
      }

      // Non-string accountType
      const numRes = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'badtype_num@scaler.com',
          name: 'Bad Type User',
          password: 'Password123!',
          accountType: 12345,
        });
      assert.equal(numRes.status, 422);
    });

    test('8. Duplicate-email handling still works for both account types', async () => {
      // Try to register teacher using already registered student email
      const resDupStudent = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'student.explicit@scaler.com',
          name: 'Duplicate Teacher Attempt',
          password: 'Password123!',
          accountType: 'teacher',
          inviteCode: TEST_TEACHER_CODE,
        });
      assert.equal(resDupStudent.status, 409);
      assert.equal(resDupStudent.body.error, 'Conflict');

      // Try to register student using already registered teacher email
      const resDupTeacher = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'prof.smith@scaler.com',
          name: 'Duplicate Student Attempt',
          password: 'Password123!',
          accountType: 'student',
        });
      assert.equal(resDupTeacher.status, 409);
      assert.equal(resDupTeacher.body.error, 'Conflict');
    });

    test('9. Both account types can subsequently log in and receive the correct role', async () => {
      // Login as student
      const studentLoginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'student.explicit@scaler.com', password: 'Password123!' });
      assert.equal(studentLoginRes.status, 200);
      assert.equal(studentLoginRes.body.user.role, 'student');

      // Verify session via /api/auth/me
      const studentMeRes = await request(app)
        .get('/api/auth/me')
        .set('Cookie', studentLoginRes.headers['set-cookie']);
      assert.equal(studentMeRes.status, 200);
      assert.equal(studentMeRes.body.user.role, 'student');

      // Login as teacher
      const teacherLoginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'prof.smith@scaler.com', password: 'Password123!' });
      assert.equal(teacherLoginRes.status, 200);
      assert.equal(teacherLoginRes.body.user.role, 'mentor');

      // Verify session via /api/auth/me
      const teacherMeRes = await request(app)
        .get('/api/auth/me')
        .set('Cookie', teacherLoginRes.headers['set-cookie']);
      assert.equal(teacherMeRes.status, 200);
      assert.equal(teacherMeRes.body.user.role, 'mentor');
    });

    test('10. Existing mentor and student authorization rules remain intact', async () => {
      // Student session
      const studentLoginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'student.explicit@scaler.com', password: 'Password123!' });
      const studentCookie = studentLoginRes.headers['set-cookie'];

      // Teacher session
      const teacherLoginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'prof.smith@scaler.com', password: 'Password123!' });
      const teacherCookie = teacherLoginRes.headers['set-cookie'];

      // Student is forbidden from mentor queue endpoint
      const studentQueueRes = await request(app)
        .get('/api/queue')
        .set('Cookie', studentCookie);
      assert.equal(studentQueueRes.status, 403);
      assert.equal(studentQueueRes.body.error, 'Forbidden');

      // Teacher (role: mentor) is authorized to access mentor queue endpoint
      const teacherQueueRes = await request(app)
        .get('/api/queue')
        .set('Cookie', teacherCookie);
      assert.equal(teacherQueueRes.status, 200);
      assert(Array.isArray(teacherQueueRes.body.queue));
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

      // Mentor attempting to close request is rejected (403 Forbidden)
      const mentorCloseRes = await request(app)
        .patch(`/api/requests/${claimedDoc._id}/status`)
        .set('Cookie', claimingMentorCookie)
        .send({ status: 'resolved' });
      assert.equal(mentorCloseRes.status, 403);

      // Valid transition: claimed -> in_progress
      const inProgressRes = await request(app)
        .patch(`/api/requests/${claimedDoc._id}/status`)
        .set('Cookie', claimingMentorCookie)
        .send({ status: 'in_progress' });
      assert.equal(inProgressRes.status, 200);
      assert.equal(inProgressRes.body.request.status, 'in_progress');

      // Student closes the session with rating
      const studentCloseRes = await request(app)
        .post(`/api/requests/${claimedDoc._id}/close`)
        .set('Cookie', studentCookie)
        .send({ rating: 5, comment: 'Session resolved successfully.' });
      assert.equal(studentCloseRes.status, 200);
      assert.equal(studentCloseRes.body.request.status, 'resolved');

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
        .send({ status: 'in_progress', resolutionNotes: longNotes });
      assert.equal(badNotesRes.status, 422);

      // Mentor cannot close session directly (403 Forbidden)
      const mentorCloseAttempt = await request(app)
        .patch(`/api/requests/${waitDoc._id}/status`)
        .set('Cookie', mentorCookie)
        .send({ status: 'resolved' });
      assert.equal(mentorCloseAttempt.status, 403);

      // Mentor updates notes while in progress
      const notesRes = await request(app)
        .patch(`/api/requests/${waitDoc._id}/status`)
        .set('Cookie', mentorCookie)
        .send({
          status: 'in_progress',
          resolutionNotes: 'Configured Vite proxy ws: true option in vite.config.js to support upgrade headers.',
        });

      assert.equal(notesRes.status, 200);
      assert.equal(
        notesRes.body.request.resolutionNotes,
        'Configured Vite proxy ws: true option in vite.config.js to support upgrade headers.'
      );

      // Student closes session with verified rating
      const resolveRes = await request(app)
        .post(`/api/requests/${waitDoc._id}/close`)
        .set('Cookie', studentCookie)
        .send({ rating: 5, comment: 'Thank you for explaining the proxy headers!' });

      assert.equal(resolveRes.status, 200);
      assert.equal(resolveRes.body.request.status, 'resolved');
      assert.equal(resolveRes.body.request.feedback.rating, 5);
      assert(resolveRes.body.request.resolvedAt);
    });

    test('student submits verified feedback with rating and comment for resolved session', async () => {
      // Create a dedicated resolved request without feedback to test /feedback endpoint
      const resolvedDoc = await HelpRequest.create({
        student: studentUser.id,
        topic: 'Algorithm complexity review',
        description: 'Need review on Dijkstra heap asymptotic bound.',
        category: 'dsa',
        status: 'resolved',
        mentor: mentorUser._id || mentorUser.id,
        resolutionNotes: 'Walked through master theorem and binary heap decrease-key complexity.',
        resolvedAt: new Date(),
        feedback: { rating: null, comment: '' },
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

  // -------------------------------------------------------------------------
  // INTERACTIVE DOUBT CONVERSATION & CLOSURE FLOW
  // -------------------------------------------------------------------------
  describe('Interactive Doubt Conversation & Closure Flow', () => {
    let studentCookie;
    let otherStudentCookie;
    let mentorCookie;
    let otherMentorCookie;
    let studentUser;
    let otherStudentUser;
    let mentorUser;
    let otherMentorUser;

    before(async () => {
      // Create student 1
      const s1Res = await request(app).post('/api/auth/register').send({
        name: 'Arjun Verma',
        email: 'arjun.verma@college.edu',
        password: 'Password123!',
      });
      studentCookie = s1Res.headers['set-cookie'][0];
      studentUser = s1Res.body.user;

      // Create student 2
      const s2Res = await request(app).post('/api/auth/register').send({
        name: 'Rohan Sharma',
        email: 'rohan.sharma@college.edu',
        password: 'Password123!',
      });
      otherStudentCookie = s2Res.headers['set-cookie'][0];
      otherStudentUser = s2Res.body.user;

      // Configure teacher invite code
      const CONVO_TEACHER_CODE = 'LL-TEST-INVITE-SECURE-KEY-440';
      config.teacherInviteCode = CONVO_TEACHER_CODE;
      process.env.TEACHER_INVITE_CODE = CONVO_TEACHER_CODE;

      // Create mentor 1
      const m1Res = await request(app).post('/api/auth/register').send({
        name: 'Prof Sneha Desai',
        email: 'sneha.desai@college.edu',
        password: 'Password123!',
        accountType: 'teacher',
        inviteCode: CONVO_TEACHER_CODE,
      });
      assert.equal(m1Res.status, 201);
      mentorCookie = m1Res.headers['set-cookie'][0];
      mentorUser = m1Res.body.user;

      // Create mentor 2
      const m2Res = await request(app).post('/api/auth/register').send({
        name: 'Prof Vivek Joshi',
        email: 'vivek.joshi@college.edu',
        password: 'Password123!',
        accountType: 'teacher',
        inviteCode: CONVO_TEACHER_CODE,
      });
      assert.equal(m2Res.status, 201);
      otherMentorCookie = m2Res.headers['set-cookie'][0];
      otherMentorUser = m2Res.body.user;
    });

    test('full conversation flow: submit doubt -> accept -> reply -> follow-up -> reply -> student close & rating', async () => {
      // 1. Student creates request
      const createRes = await request(app)
        .post('/api/requests')
        .set('Cookie', studentCookie)
        .send({
          topic: 'Segmentation fault in binary tree destructor',
          description: 'Recursion runs infinitely on circular pointer cycles.',
          category: 'dsa',
          codeSnippet: 'void ~Tree() { delete left; delete right; }',
        });
      assert.equal(createRes.status, 201);
      const reqId = createRes.body.request._id;

      // Cannot post message before a mentor accepts it (409 Conflict)
      const prematureMsgRes = await request(app)
        .post(`/api/requests/${reqId}/messages`)
        .set('Cookie', studentCookie)
        .send({ content: 'Any updates?' });
      assert.equal(prematureMsgRes.status, 409);

      // 2. Mentor accepts request
      const claimRes = await request(app)
        .post(`/api/requests/${reqId}/claim`)
        .set('Cookie', mentorCookie);
      assert.equal(claimRes.status, 200);
      assert.equal(claimRes.body.request.status, 'claimed');

      // 3. Mentor posts initial reply
      const mentorReply1 = await request(app)
        .post(`/api/requests/${reqId}/messages`)
        .set('Cookie', mentorCookie)
        .send({
          content: 'Inspect whether nodes are doubly linked or have parent pointers. If so, recursive delete causes cyclic destruction.',
        });
      assert.equal(mentorReply1.status, 201);
      assert.equal(mentorReply1.body.request.status, 'awaiting_student');
      assert.equal(mentorReply1.body.request.messages.length, 1);
      assert.equal(mentorReply1.body.newMessage.senderRole, 'mentor');

      // 4. Student posts follow-up message
      const studentFollowup = await request(app)
        .post(`/api/requests/${reqId}/messages`)
        .set('Cookie', studentCookie)
        .send({
          content: 'You were right! The parent pointer was also deleting the child. How should I nullify the parent reference before delete?',
        });
      assert.equal(studentFollowup.status, 201);
      assert.equal(studentFollowup.body.request.status, 'awaiting_mentor');
      assert.equal(studentFollowup.body.request.messages.length, 2);
      assert.equal(studentFollowup.body.newMessage.senderRole, 'student');

      // 5. Mentor posts second reply
      const mentorReply2 = await request(app)
        .post(`/api/requests/${reqId}/messages`)
        .set('Cookie', mentorCookie)
        .send({
          content: 'Clear the parent pointer by setting parent = nullptr before calling delete, or use std::unique_ptr for children and std::weak_ptr for parents.',
        });
      assert.equal(mentorReply2.status, 201);
      assert.equal(mentorReply2.body.request.status, 'awaiting_student');
      assert.equal(mentorReply2.body.request.messages.length, 3);

      // Verify request details return full message thread
      const detailsRes = await request(app)
        .get(`/api/requests/${reqId}`)
        .set('Cookie', studentCookie);
      assert.equal(detailsRes.status, 200);
      assert.equal(detailsRes.body.request.messages.length, 3);
      assert.equal(detailsRes.body.request.messages[0].senderRole, 'mentor');
      assert.equal(detailsRes.body.request.messages[1].senderRole, 'student');
      assert.equal(detailsRes.body.request.messages[2].senderRole, 'mentor');

      // 6. Student closes session with rating & feedback
      const closeRes = await request(app)
        .post(`/api/requests/${reqId}/close`)
        .set('Cookie', studentCookie)
        .send({
          rating: 5,
          comment: 'Perfect explanation of smart pointers and cyclic references!',
        });
      assert.equal(closeRes.status, 200);
      assert.equal(closeRes.body.request.status, 'resolved');
      assert.equal(closeRes.body.request.feedback.rating, 5);
      assert.equal(closeRes.body.request.feedback.comment, 'Perfect explanation of smart pointers and cyclic references!');
      assert(closeRes.body.request.resolvedAt);

      // Cannot post message after request is resolved (409 Conflict)
      const postClosedRes = await request(app)
        .post(`/api/requests/${reqId}/messages`)
        .set('Cookie', studentCookie)
        .send({ content: 'One more thing...' });
      assert.equal(postClosedRes.status, 409);
    });

    test('attempt by an unassigned mentor to post a reply is rejected (403 Forbidden)', async () => {
      // Student creates request
      const createRes = await request(app)
        .post('/api/requests')
        .set('Cookie', studentCookie)
        .send({
          topic: 'CSS grid overflow issue',
          description: 'Grid item expands past viewport width.',
          category: 'frontend',
        });
      const reqId = createRes.body.request._id;

      // Mentor 1 claims it
      await request(app)
        .post(`/api/requests/${reqId}/claim`)
        .set('Cookie', mentorCookie);

      // Mentor 2 (unassigned) tries to post reply
      const unassignedReply = await request(app)
        .post(`/api/requests/${reqId}/messages`)
        .set('Cookie', otherMentorCookie)
        .send({ content: 'Try minmax(0, 1fr).' });
      assert.equal(unassignedReply.status, 403);
      assert(unassignedReply.body.message.includes('Only the mentor assigned'));
    });

    test('attempt by a student to post a reply to someone else request is rejected (403 Forbidden)', async () => {
      // Student 1 creates request
      const createRes = await request(app)
        .post('/api/requests')
        .set('Cookie', studentCookie)
        .send({
          topic: 'Database connection pool exhausted',
          description: 'Max 100 connections reached during peak load.',
          category: 'database',
        });
      const reqId = createRes.body.request._id;

      // Mentor claims it
      await request(app)
        .post(`/api/requests/${reqId}/claim`)
        .set('Cookie', mentorCookie);

      // Student 2 tries to post to Student 1 request
      const rogueStudentReply = await request(app)
        .post(`/api/requests/${reqId}/messages`)
        .set('Cookie', otherStudentCookie)
        .send({ content: 'I have the same problem!' });
      assert.equal(rogueStudentReply.status, 403);
      assert(rogueStudentReply.body.message.includes('only post follow-ups to your own'));
    });

    test('attempt by a mentor to close the request is rejected (403 Forbidden)', async () => {
      const createRes = await request(app)
        .post('/api/requests')
        .set('Cookie', studentCookie)
        .send({
          topic: 'Express CORS preflight issue',
          description: 'OPTIONS request returns 404.',
          category: 'backend',
        });
      const reqId = createRes.body.request._id;

      await request(app)
        .post(`/api/requests/${reqId}/claim`)
        .set('Cookie', mentorCookie);

      // Mentor attempts to call student-only /close endpoint (403 Forbidden by role check)
      const mentorCloseCall = await request(app)
        .post(`/api/requests/${reqId}/close`)
        .set('Cookie', mentorCookie)
        .send({ rating: 5 });
      assert.equal(mentorCloseCall.status, 403);

      // Mentor attempts to transition to resolved via status endpoint (403 Forbidden)
      const mentorStatusCall = await request(app)
        .patch(`/api/requests/${reqId}/status`)
        .set('Cookie', mentorCookie)
        .send({ status: 'resolved' });
      assert.equal(mentorStatusCall.status, 403);
      assert(mentorStatusCall.body.message.includes('Mentors cannot close sessions'));
    });

    test('attempt to submit feedback on an unclosed or already-closed request is rejected (409 Conflict)', async () => {
      const createRes = await request(app)
        .post('/api/requests')
        .set('Cookie', studentCookie)
        .send({
          topic: 'Docker container port mapping',
          description: 'Cannot reach container on localhost:3000.',
          category: 'environment',
        });
      const reqId = createRes.body.request._id;

      // Unclosed request feedback attempt (409 Conflict)
      const unclosedFeedback = await request(app)
        .post(`/api/requests/${reqId}/feedback`)
        .set('Cookie', studentCookie)
        .send({ rating: 5, comment: 'Nice' });
      assert.equal(unclosedFeedback.status, 409);

      // Claim and close properly
      await request(app)
        .post(`/api/requests/${reqId}/claim`)
        .set('Cookie', mentorCookie);

      const closeRes = await request(app)
        .post(`/api/requests/${reqId}/close`)
        .set('Cookie', studentCookie)
        .send({ rating: 4, comment: 'Good session' });
      assert.equal(closeRes.status, 200);

      // Duplicate close attempt (409 Conflict)
      const dupCloseRes = await request(app)
        .post(`/api/requests/${reqId}/close`)
        .set('Cookie', studentCookie)
        .send({ rating: 5 });
      assert.equal(dupCloseRes.status, 409);

      // Duplicate feedback submission (409 Conflict)
      const dupFeedbackRes = await request(app)
        .post(`/api/requests/${reqId}/feedback`)
        .set('Cookie', studentCookie)
        .send({ rating: 5, comment: 'Double rating' });
      assert.equal(dupFeedbackRes.status, 409);
    });

    test('attempt to submit invalid ratings (< 1, > 5, non-integer) is rejected (422 Unprocessable Entity)', async () => {
      const createRes = await request(app)
        .post('/api/requests')
        .set('Cookie', studentCookie)
        .send({
          topic: 'Git detached HEAD state',
          description: 'Committed to checkout commit hash.',
          category: 'other',
        });
      const reqId = createRes.body.request._id;

      await request(app)
        .post(`/api/requests/${reqId}/claim`)
        .set('Cookie', mentorCookie);

      // Rating = 0 (< 1)
      const lowRatingRes = await request(app)
        .post(`/api/requests/${reqId}/close`)
        .set('Cookie', studentCookie)
        .send({ rating: 0 });
      assert.equal(lowRatingRes.status, 422);

      // Rating = 6 (> 5)
      const highRatingRes = await request(app)
        .post(`/api/requests/${reqId}/close`)
        .set('Cookie', studentCookie)
        .send({ rating: 6 });
      assert.equal(highRatingRes.status, 422);

      // Non-integer rating (3.5)
      const floatRatingRes = await request(app)
        .post(`/api/requests/${reqId}/close`)
        .set('Cookie', studentCookie)
        .send({ rating: 3.5 });
      assert.equal(floatRatingRes.status, 422);

      // Non-numeric rating string ("five")
      const strRatingRes = await request(app)
        .post(`/api/requests/${reqId}/close`)
        .set('Cookie', studentCookie)
        .send({ rating: 'five' });
      assert.equal(strRatingRes.status, 422);

      // Missing rating
      const missingRatingRes = await request(app)
        .post(`/api/requests/${reqId}/close`)
        .set('Cookie', studentCookie)
        .send({});
      assert.equal(missingRatingRes.status, 422);
    });

    test('message validation: empty message or message exceeding 2000 chars is rejected (422)', async () => {
      const createRes = await request(app)
        .post('/api/requests')
        .set('Cookie', studentCookie)
        .send({
          topic: 'Array index out of bounds in quicksort',
          description: 'Partition function crashes on single-element partition.',
          category: 'dsa',
        });
      const reqId = createRes.body.request._id;

      await request(app)
        .post(`/api/requests/${reqId}/claim`)
        .set('Cookie', mentorCookie);

      // Empty string
      const emptyRes = await request(app)
        .post(`/api/requests/${reqId}/messages`)
        .set('Cookie', mentorCookie)
        .send({ content: '   ' });
      assert.equal(emptyRes.status, 422);

      // Over 2000 chars
      const overlongRes = await request(app)
        .post(`/api/requests/${reqId}/messages`)
        .set('Cookie', mentorCookie)
        .send({ content: 'a'.repeat(2001) });
      assert.equal(overlongRes.status, 422);
    });

    test('GET /api/requests/:id authorization and validation edge cases', async () => {
      // Create student 2
      const s2Res = await request(app).post('/api/auth/register').send({
        name: 'Unrelated Student',
        email: 'unrelated.student@college.edu',
        password: 'Password123!',
        accountType: 'student',
      });
      assert.equal(s2Res.status, 201);
      const student2Cookie = s2Res.headers['set-cookie'][0];

      // Student 1 creates request
      const createRes = await request(app)
        .post('/api/requests')
        .set('Cookie', studentCookie)
        .send({
          topic: 'Dijkstra priority queue comparator',
          description: 'Custom comparator in std::priority_queue is inversed.',
          category: 'dsa',
        });
      assert.equal(createRes.status, 201);
      const reqId = createRes.body.request._id;

      // 1. Unauthenticated request rejected (401)
      const unauthRes = await request(app).get(`/api/requests/${reqId}`);
      assert.equal(unauthRes.status, 401);

      // 2. Malformed ObjectId returns 404 with JSON error
      const malformedRes = await request(app)
        .get('/api/requests/not-a-valid-id')
        .set('Cookie', studentCookie);
      assert.equal(malformedRes.status, 404);
      assert.equal(malformedRes.body.error, 'Not Found');

      // 3. Non-existent valid ObjectId returns 404
      const nonExistentId = new mongoose.Types.ObjectId();
      const notFoundRes = await request(app)
        .get(`/api/requests/${nonExistentId}`)
        .set('Cookie', studentCookie);
      assert.equal(notFoundRes.status, 404);
      assert.equal(notFoundRes.body.error, 'Not Found');

      // 4. Student 1 (owner) can access (200 OK)
      const ownerRes = await request(app)
        .get(`/api/requests/${reqId}`)
        .set('Cookie', studentCookie);
      assert.equal(ownerRes.status, 200);
      assert.equal(ownerRes.body.request._id, reqId);
      assert.equal(ownerRes.body.request.topic, 'Dijkstra priority queue comparator');

      // 5. Student 2 (unrelated) is forbidden from viewing (403 Forbidden)
      const forbiddenRes = await request(app)
        .get(`/api/requests/${reqId}`)
        .set('Cookie', student2Cookie);
      assert.equal(forbiddenRes.status, 403);
      assert.equal(forbiddenRes.body.error, 'Forbidden');
      assert.equal(forbiddenRes.body.message, 'You can only view your own help requests.');

      // 6. Mentor can access any request for queue and triage operations (200 OK)
      const mentorViewRes = await request(app)
        .get(`/api/requests/${reqId}`)
        .set('Cookie', mentorCookie);
      assert.equal(mentorViewRes.status, 200);
      assert.equal(mentorViewRes.body.request._id, reqId);
    });

    test('search and filtering on GET /api/requests/mine', async () => {
      // Create another request for student 1 with distinct category
      await request(app)
        .post('/api/requests')
        .set('Cookie', studentCookie)
        .send({
          topic: 'PostgreSQL connection pool exhaustion',
          description: 'Client leaks idle connections under high load.',
          category: 'database',
        });

      // Filter by category=database
      const dbRes = await request(app)
        .get('/api/requests/mine?category=database')
        .set('Cookie', studentCookie);
      assert.equal(dbRes.status, 200);
      assert(dbRes.body.requests.every(r => r.category === 'database'));

      // Filter by search term
      const searchRes = await request(app)
        .get('/api/requests/mine?search=exhaustion')
        .set('Cookie', studentCookie);
      assert.equal(searchRes.status, 200);
      assert(searchRes.body.requests.length >= 1);
      assert(searchRes.body.requests.some(r => r.topic.includes('exhaustion') || r.description.includes('exhaustion')));
    });
  });
});
