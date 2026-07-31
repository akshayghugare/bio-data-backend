const mongoose = require('mongoose');

const { Schema } = mongoose;

/** One record per membership payment attempt, created → paid | failed. */
const paymentSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    orderId: { type: String, required: true, unique: true, index: true },
    paymentId: { type: String, default: '' },
    signature: { type: String, default: '', select: false },

    amount: { type: Number, required: true },        // paise
    currency: { type: String, default: 'INR' },

    status: { type: String, enum: ['created', 'paid', 'failed'], default: 'created', index: true },
    failureReason: { type: String, default: '' },
    paidAt: { type: Date, default: null },
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

paymentSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Payment', paymentSchema);
