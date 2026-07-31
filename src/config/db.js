const mongoose = require('mongoose');
const env = require('./env');

mongoose.set('strictQuery', true);

async function connectDB() {
  mongoose.connection.on('connected', () => console.log('MongoDB connected'));
  mongoose.connection.on('error', (error) => console.error('MongoDB error:', error.message));
  mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected'));

  await mongoose.connect(env.mongoUri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 15000,
  });
}

async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) await mongoose.connection.close();
}

module.exports = { connectDB, disconnectDB, mongoose };
