import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { config } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { HelpRequest } from '../src/models/HelpRequest.js';
import { COOKIE_NAME } from '../src/utils/token.js';
import { getGridFSBucket } from '../src/utils/imageStorage.js';

const TEST_DB_URI = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/labline_attachments_test';

// Valid image signatures
const validPngBuffer = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);
const validJpgBuffer = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
]);
const validWebpBuffer = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.alloc(4),
  Buffer.from('WEBP'),
  Buffer.from('VP8 '),
]);

describe('Secure Image Attachments & GridFS Storage Test Suite', () => {
  let app;
  let studentCookie;
  let otherStudentCookie;
  let mentorCookie;
  let studentUser;
  let otherStudentUser;
  let mentorUser;

  before(async () => {
    process.env.NODE_ENV = 'test';
    process.env.CLIENT_ORIGIN = 'http://localhost:5173';
    if (!process.env.JWT_SECRET) {
      process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long!';
    }

    const TEACHER_CODE = 'attachments-test-teacher-code-xyz123';
    config.teacherInviteCode = TEACHER_CODE;
    process.env.TEACHER_INVITE_CODE = TEACHER_CODE;

    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(TEST_DB_URI);
    }

    await User.deleteMany({});
    await HelpRequest.deleteMany({});

    // Also drop GridFS attachments collections if existing
    try {
      const bucket = getGridFSBucket();
      await bucket.drop();
    } catch (e) {
      // Bucket may not exist yet
    }

    app = createApp(process.env.CLIENT_ORIGIN);

    // Register Student 1
    const s1Res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'att_student1@example.com', name: 'Student One', password: 'password123' });
    assert.equal(s1Res.status, 201);
    studentUser = s1Res.body.user;
    studentCookie = s1Res.headers['set-cookie'][0];

    // Register Student 2
    const s2Res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'att_student2@example.com', name: 'Student Two', password: 'password123' });
    assert.equal(s2Res.status, 201);
    otherStudentUser = s2Res.body.user;
    otherStudentCookie = s2Res.headers['set-cookie'][0];

    // Register Mentor via teacher registration
    const mLogin = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'att_mentor@example.com',
        name: 'Mentor Alex',
        password: 'password123',
        accountType: 'teacher',
        inviteCode: TEACHER_CODE,
      });
    assert.equal(mLogin.status, 201);
    mentorUser = mLogin.body.user;
    mentorCookie = mLogin.headers['set-cookie'][0];
  });

  after(async () => {
    if (mongoose.connection.readyState !== 0) {
      try {
        await mongoose.connection.dropDatabase();
      } catch (e) {
      } finally {
        await mongoose.disconnect();
      }
    }
  });

  // -------------------------------------------------------------------------
  // 1. Initial Doubt Submission with Attachments
  // -------------------------------------------------------------------------
  describe('Student Doubt Submission with Attachments', () => {
    test('submits doubt with 1 valid PNG attachment', async () => {
      const res = await request(app)
        .post('/api/requests')
        .set('Cookie', studentCookie)
        .field('topic', 'React hydration error')
        .field('description', 'Hydration mismatch screenshot attached')
        .field('category', 'frontend')
        .attach('images', validPngBuffer, { filename: 'hydration.png', contentType: 'image/png' });

      assert.equal(res.status, 201);
      assert.equal(res.body.request.attachments.length, 1);
      const att = res.body.request.attachments[0];
      assert.equal(att.originalName, 'hydration.png');
      assert.equal(att.mimeType, 'image/png');
      assert(att.fileId);
    });

    test('submits doubt with 3 valid images (PNG, JPEG, WebP)', async () => {
      const res = await request(app)
        .post('/api/requests')
        .set('Cookie', studentCookie)
        .field('topic', 'Multiple screenshots attached')
        .field('description', 'Terminal, browser, and network traces')
        .field('category', 'backend')
        .attach('images', validPngBuffer, { filename: 'terminal.png', contentType: 'image/png' })
        .attach('images', validJpgBuffer, { filename: 'browser.jpg', contentType: 'image/jpeg' })
        .attach('images', validWebpBuffer, { filename: 'network.webp', contentType: 'image/webp' });

      assert.equal(res.status, 201);
      assert.equal(res.body.request.attachments.length, 3);
      assert.equal(res.body.request.attachments[0].mimeType, 'image/png');
      assert.equal(res.body.request.attachments[1].mimeType, 'image/jpeg');
      assert.equal(res.body.request.attachments[2].mimeType, 'image/webp');
    });

    test('rejects doubt submission with 4 images (exceeds max limit 3)', async () => {
      const res = await request(app)
        .post('/api/requests')
        .set('Cookie', studentCookie)
        .field('topic', 'Too many attachments')
        .field('description', 'Trying to attach four images')
        .attach('images', validPngBuffer, { filename: '1.png', contentType: 'image/png' })
        .attach('images', validPngBuffer, { filename: '2.png', contentType: 'image/png' })
        .attach('images', validPngBuffer, { filename: '3.png', contentType: 'image/png' })
        .attach('images', validPngBuffer, { filename: '4.png', contentType: 'image/png' });

      assert.equal(res.status, 422);
      assert.equal(res.body.message, 'Validation failed');
      assert(res.body.details.some((d) => d.includes('Cannot attach more than 3 images')));
    });

    test('rejects doubt with unsupported file format (text/pdf)', async () => {
      const textBuf = Buffer.from('console.log("hello world");');
      const res = await request(app)
        .post('/api/requests')
        .set('Cookie', studentCookie)
        .field('topic', 'Invalid format test')
        .field('description', 'Attaching text file as image')
        .attach('images', textBuf, { filename: 'code.txt', contentType: 'text/plain' });

      assert.equal(res.status, 422);
      assert.equal(res.body.message, 'Validation failed');
      assert(res.body.details.some((d) => d.includes('unsupported') || d.includes('extension')));
    });

    test('rejects doubt with malformed image (content does not match magic bytes)', async () => {
      const fakePng = Buffer.from('Not a real png file content at all!');
      const res = await request(app)
        .post('/api/requests')
        .set('Cookie', studentCookie)
        .field('topic', 'Spoofed extension test')
        .field('description', 'Attaching text file renamed to fake.png')
        .attach('images', fakePng, { filename: 'fake.png', contentType: 'image/png' });

      assert.equal(res.status, 422);
      assert.equal(res.body.message, 'Validation failed');
      assert(res.body.details.some((d) => d.includes('malformed') || d.includes('signature') || d.includes('does not match')));
    });

    test('rejects doubt with oversized image (> 5 MB)', async () => {
      const oversizedBuf = Buffer.concat([
        validPngBuffer,
        Buffer.alloc(5 * 1024 * 1024 + 100),
      ]);
      const res = await request(app)
        .post('/api/requests')
        .set('Cookie', studentCookie)
        .field('topic', 'Oversized file test')
        .field('description', 'Attaching image over 5 MB')
        .attach('images', oversizedBuf, { filename: 'oversized.png', contentType: 'image/png' });

      assert.equal(res.status, 422);
      assert.equal(res.body.message, 'Validation failed');
      assert(res.body.details.some((d) => d.includes('5 MB')));
    });

    test('text-only doubt without attachments continues to work normally', async () => {
      const res = await request(app)
        .post('/api/requests')
        .set('Cookie', studentCookie)
        .send({
          topic: 'Standard text doubt',
          description: 'No images attached to this regular doubt',
          category: 'dsa',
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.request.attachments.length, 0);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Conversation Messages with Attachments
  // -------------------------------------------------------------------------
  describe('Conversation Messages with Attachments', () => {
    let activeRequestId;
    let studentAttachmentId;

    before(async () => {
      // Create a request with an attachment to test full lifecycle
      const createRes = await request(app)
        .post('/api/requests')
        .set('Cookie', studentCookie)
        .field('topic', 'Full lifecycle chat with images')
        .field('description', 'Initial description with attached trace')
        .field('category', 'database')
        .attach('images', validPngBuffer, { filename: 'query_plan.png', contentType: 'image/png' });

      assert.equal(createRes.status, 201);
      activeRequestId = createRes.body.request._id;
      studentAttachmentId = createRes.body.request.attachments[0]._id;

      // Mentor claims the request
      const claimRes = await request(app)
        .post(`/api/requests/${activeRequestId}/claim`)
        .set('Cookie', mentorCookie);
      assert.equal(claimRes.status, 200);
    });

    test('mentor posts reply with image attachment and text', async () => {
      const res = await request(app)
        .post(`/api/requests/${activeRequestId}/messages`)
        .set('Cookie', mentorCookie)
        .field('content', 'Here is the fixed indexing strategy diagram')
        .attach('images', validJpgBuffer, { filename: 'index_fix.jpg', contentType: 'image/jpeg' });

      assert.equal(res.status, 201);
      assert.equal(res.body.newMessage.content, 'Here is the fixed indexing strategy diagram');
      assert.equal(res.body.newMessage.attachments.length, 1);
      assert.equal(res.body.newMessage.attachments[0].originalName, 'index_fix.jpg');
      assert.equal(res.body.newMessage.attachments[0].mimeType, 'image/jpeg');
    });

    test('student posts follow-up message with image attachment', async () => {
      const res = await request(app)
        .post(`/api/requests/${activeRequestId}/messages`)
        .set('Cookie', studentCookie)
        .field('content', 'Index created, here is the new EXPLAIN ANALYZE output')
        .attach('images', validWebpBuffer, { filename: 'explain.webp', contentType: 'image/webp' });

      assert.equal(res.status, 201);
      assert.equal(res.body.newMessage.attachments.length, 1);
      assert.equal(res.body.newMessage.attachments[0].mimeType, 'image/webp');
    });

    test('message with image attachment and empty content is allowed', async () => {
      const res = await request(app)
        .post(`/api/requests/${activeRequestId}/messages`)
        .set('Cookie', mentorCookie)
        .attach('images', validPngBuffer, { filename: 'visual_hint.png', contentType: 'image/png' });

      assert.equal(res.status, 201);
      assert.equal(res.body.newMessage.attachments.length, 1);
      assert.equal(res.body.newMessage.content, '');
    });

    test('message with neither content nor image is rejected (422)', async () => {
      const res = await request(app)
        .post(`/api/requests/${activeRequestId}/messages`)
        .set('Cookie', mentorCookie)
        .field('content', '   ');

      assert.equal(res.status, 422);
      assert.equal(res.body.message, 'Message content or at least one image attachment is required.');
    });

    test('conversation history preserves attachments on GET /api/requests/:id', async () => {
      const res = await request(app)
        .get(`/api/requests/${activeRequestId}`)
        .set('Cookie', studentCookie);

      assert.equal(res.status, 200);
      assert.equal(res.body.request.attachments.length, 1);
      assert.equal(res.body.request.attachments[0].originalName, 'query_plan.png');
      // Messages should retain their attachments
      const messagesWithAttachments = res.body.request.messages.filter(
        (m) => m.attachments && m.attachments.length > 0
      );
      assert.equal(messagesWithAttachments.length, 3);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Security, Authorization & Retrieval
  // -------------------------------------------------------------------------
  describe('Security and Attachment Retrieval Authorization', () => {
    let requestId;
    let attachmentId;

    before(async () => {
      const createRes = await request(app)
        .post('/api/requests')
        .set('Cookie', studentCookie)
        .field('topic', 'Security test request')
        .field('description', 'Testing private image authorization')
        .attach('images', validPngBuffer, { filename: 'secret.png', contentType: 'image/png' });

      assert.equal(createRes.status, 201);
      requestId = createRes.body.request._id;
      attachmentId = createRes.body.request.attachments[0]._id;
    });

    test('request owner (student) can retrieve their own image attachment', async () => {
      const res = await request(app)
        .get(`/api/requests/${requestId}/attachments/${attachmentId}`)
        .set('Cookie', studentCookie);

      assert.equal(res.status, 200);
      assert.equal(res.headers['content-type'], 'image/png');
      assert.equal(res.headers['x-content-type-options'], 'nosniff');
      assert(res.headers['content-disposition'].includes('secret.png'));
      assert(res.body.length > 0);
    });

    test('authorized mentor can retrieve image attachment', async () => {
      const res = await request(app)
        .get(`/api/requests/${requestId}/attachments/${attachmentId}`)
        .set('Cookie', mentorCookie);

      assert.equal(res.status, 200);
      assert.equal(res.headers['content-type'], 'image/png');
    });

    test('unauthenticated request is rejected (401)', async () => {
      const res = await request(app).get(
        `/api/requests/${requestId}/attachments/${attachmentId}`
      );
      assert.equal(res.status, 401);
    });

    test('different student cannot access private image from another student request (403)', async () => {
      const res = await request(app)
        .get(`/api/requests/${requestId}/attachments/${attachmentId}`)
        .set('Cookie', otherStudentCookie);

      assert.equal(res.status, 403);
      assert.equal(res.body.message, 'You can only view attachments from your own help requests.');
    });

    test('non-existent attachment ID returns 404', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/requests/${requestId}/attachments/${fakeId}`)
        .set('Cookie', studentCookie);

      assert.equal(res.status, 404);
    });

    test('attachment ID from a different request returns 404', async () => {
      // Create request 2
      const req2Res = await request(app)
        .post('/api/requests')
        .set('Cookie', studentCookie)
        .send({
          topic: 'Request 2 topic',
          description: 'Request 2 description',
        });
      assert.equal(req2Res.status, 201);
      const req2Id = req2Res.body.request._id;

      // Try accessing request 1's attachment through request 2
      const res = await request(app)
        .get(`/api/requests/${req2Id}/attachments/${attachmentId}`)
        .set('Cookie', studentCookie);

      assert.equal(res.status, 404);
    });
  });
});
