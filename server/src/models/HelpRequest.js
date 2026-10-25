import mongoose from 'mongoose';

const helpRequestSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Student reference is required'],
      index: true,
    },
    topic: {
      type: String,
      required: [true, 'Topic is required'],
      trim: true,
      minlength: [2, 'Topic must be at least 2 characters long'],
      maxlength: [100, 'Topic cannot exceed 100 characters'],
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      minlength: [5, 'Description must be at least 5 characters long'],
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
    },
    codeSnippet: {
      type: String,
      trim: true,
      maxlength: [3000, 'Code snippet cannot exceed 3000 characters'],
      default: '',
    },
    status: {
      type: String,
      enum: {
        values: ['waiting', 'claimed', 'in_progress', 'resolved', 'cancelled'],
        message: '{VALUE} is not a valid status',
      },
      default: 'waiting',
      required: true,
      index: true,
    },
    mentor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    claimedAt: {
      type: Date,
      default: null,
    },
    inProgressAt: {
      type: Date,
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for optimal queue queries
helpRequestSchema.index({ status: 1, createdAt: 1 });
helpRequestSchema.index({ student: 1, createdAt: -1 });

export const HelpRequest = mongoose.model('HelpRequest', helpRequestSchema);
