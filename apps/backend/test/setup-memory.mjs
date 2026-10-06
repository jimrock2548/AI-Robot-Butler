// Keep the default test suite isolated from a developer's local PostgreSQL .env.
process.env.DB_MODE = 'memory';
process.env.ROBOT_MODE = 'sim';
process.env.AI_MODE = 'off';
