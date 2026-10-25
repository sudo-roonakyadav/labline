#!/usr/bin/env node

import mongoose from 'mongoose';
import { config, validateConfig } from '../config/env.js';
import { connectDB } from '../config/db.js';
import { User } from '../models/User.js';

async function main() {
  const emailArg = process.argv[2];

  if (!emailArg || !emailArg.trim()) {
    console.error('Error: Email argument is required.');
    console.error('Usage: npm run promote-mentor -- <email>');
    console.error('Example: npm run promote-mentor -- mentor@scaler.com');
    process.exit(1);
  }

  const email = emailArg.trim().toLowerCase();

  try {
    validateConfig();
    await connectDB(config.mongodbUri);

    const user = await User.findOne({ email });

    if (!user) {
      console.error(`[Error] User with email "${email}" does not exist in the database.`);
      console.error('The target account must be registered as a student first before promotion.');
      await mongoose.disconnect();
      process.exit(1);
    }

    if (user.role === 'mentor') {
      console.log(`[Notice] User "${user.name}" (${user.email}) is already assigned the mentor role.`);
      await mongoose.disconnect();
      process.exit(0);
    }

    user.role = 'mentor';
    await user.save();

    console.log(`[Success] Successfully promoted account to mentor:`);
    console.log(`  ID:    ${user._id}`);
    console.log(`  Name:  ${user.name}`);
    console.log(`  Email: ${user.email}`);
    console.log(`  Role:  ${user.role}`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('[Fatal Error]', err.message);
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    process.exit(1);
  }
}

main();
