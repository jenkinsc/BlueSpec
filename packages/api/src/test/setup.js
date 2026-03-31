// Use in-memory SQLite for tests
process.env.DATABASE_URL = 'file::memory:';
// Disable rate limiting for tests
process.env.RATE_LIMIT_GLOBAL = '100000';
process.env.RATE_LIMIT_AUTH = '100000';
