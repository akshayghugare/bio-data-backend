const mongoose = require('mongoose');

const { Schema } = mongoose;

/**
 * A "Like / Interested" signal from one member to another.
 * The unique (from, to) index makes sending an interest idempotent.
 */
const interestSchema = new Schema(
  {
    from: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    to: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['like', 'interested'], default: 'interested' },
    message: { type: String, trim: true, maxlength: 300, default: '' },
    status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending', index: true },
    /** Read state for the receiver's notification badge. */
    isRead: { type: Boolean, default: false, index: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

interestSchema.index({ from: 1, to: 1 }, { unique: true });
interestSchema.index({ to: 1, createdAt: -1 });

module.exports = mongoose.model('Interest', interestSchema);
