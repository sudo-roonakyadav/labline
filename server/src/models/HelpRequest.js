import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Message sender reference is required'],
    },
    senderRole: {
      type: String,
      enum: {
        values: ['student', 'mentor'],
        message: '{VALUE} is not a valid message sender role',
      },
      required: [true, 'Message sender role is required'],
    },
    senderName: {
      type: String,
      trim: true,
      default: '',
    },
    content: {
      type: String,
      required: [true, 'Message content is required'],
      trim: true,
      minlength: [1, 'Message cannot be empty'],
      maxlength: [2000, 'Message cannot exceed 2000 characters'],
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

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
    category: {
      type: String,
      enum: {
        values: ['dsa', 'frontend', 'backend', 'database', 'environment', 'other'],
        message: '{VALUE} is not a valid request category',
      },
      default: 'other',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: {
        values: ['waiting', 'claimed', 'in_progress', 'awaiting_mentor', 'awaiting_student', 'resolved', 'cancelled'],
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
    messages: {
      type: [messageSchema],
      default: [],
    },
    resolutionNotes: {
      type: String,
      trim: true,
      maxlength: [1000, 'Resolution notes cannot exceed 1000 characters'],
      default: '',
    },
    feedback: {
      rating: {
        type: Number,
        min: 1,
        max: 5,
        default: null,
      },
      comment: {
        type: String,
        trim: true,
        maxlength: [500, 'Feedback comment cannot exceed 500 characters'],
        default: '',
      },
      submittedAt: {
        type: Date,
        default: null,
      },
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
