const { rateLimit } = require('express-rate-limit');

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { 
    success: false,
    error: 'Too many requests, please try again later.' 
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Authentication rate limiter
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: { 
    success: false,
    error: 'Too many login attempts, please try again in an hour.' 
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Job application limiter
const applyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { 
    success: false,
    error: 'Too many applications submitted. Please try again later.' 
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { apiLimiter, authLimiter, applyLimiter };