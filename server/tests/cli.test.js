import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import mongoose from 'mongoose';
import { User } from '../src/models/User.js';

import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.resolve(__dirname, '../src/cli/promote-mentor.js');

describe('Mentor Promotion CLI Utility', () => {
  before(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/labline');
    }
    await User.deleteMany({ email: 'cli_test_user@scaler.com' });
  });

  after(async () => {
    await User.deleteMany({ email: 'cli_test_user@scaler.com' });
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  test('promotes existing student to mentor role', async () => {
    // 1. Create a student
    const student = await User.create({
      email: 'cli_test_user@scaler.com',
      name: 'CLI Student',
      passwordHash: 'dummy_hash',
      role: 'student',
    });
    assert.equal(student.role, 'student');

    // 2. Run CLI command
    const { stdout } = await execFileAsync(process.execPath, [CLI_PATH, 'cli_test_user@scaler.com']);
    assert(stdout.includes('Successfully promoted account to mentor'));

    // 3. Verify in database
    const refreshed = await User.findById(student._id);
    assert.equal(refreshed.role, 'mentor');

    // 4. Run CLI again (already mentor)
    const { stdout: secondRun } = await execFileAsync(process.execPath, [CLI_PATH, 'cli_test_user@scaler.com']);
    assert(secondRun.includes('is already assigned the mentor role'));
  });

  test('fails clearly when user does not exist', async () => {
    try {
      await execFileAsync(process.execPath, [CLI_PATH, 'ghost_user@scaler.com']);
      assert.fail('Should have failed with non-zero exit code');
    } catch (err) {
      assert.equal(err.code, 1);
      assert(err.stderr.includes('does not exist in the database'));
    }
  });
});
