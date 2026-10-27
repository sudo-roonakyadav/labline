import mongoose from 'mongoose';

const attachmentSchema = new mongoose.Schema(
  {
    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, 'GridFS file ID is required'],
    },
    filename: {
      type: String,
      required: [true, 'Stored filename is required'],
      trim: true,
    },
    originalName: {
      type: String,
      required: [true, 'Original filename is required'],
      trim: true,
    },
    mimeType: {
      type: String,
      required: [true, 'MIME type is required'],
      enum: {
        values: ['image/jpeg', 'image/png', 'image/webp'],
        message: '{VALUE} is not a supported image format',
      },
    },
    size: {
      type: Number,
      required: [true, 'File size is required'],
      max: [5 * 1024 * 1024, 'Attachment cannot exceed 5 MB'],
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

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
      trim: true,
      default: '',
      maxlength: [2000, 'Message cannot exceed 2000 characters'],
    },
    attachments: {
      type: [attachmentSchema],
      default: [],
      validate: [
        (val) => val.length <= 3,
        'Cannot attach more than 3 images to an individual message',
      ],
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

messageSchema.pre('validate', function (next) {
  const hasContent = this.content && this.content.trim().length > 0;
  const hasAttachments = Array.isArray(this.attachments) && this.attachments.length > 0;
  if (!hasContent && !hasAttachments) {
    this.invalidate('content', 'Message content or at least one image attachment is required.');
  }
  next();
});

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
    attachments: {
      type: [attachmentSchema],
      default: [],
      validate: [
        (val) => val.length <= 3,
        'Cannot attach more than 3 images to a help request',
      ],
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
