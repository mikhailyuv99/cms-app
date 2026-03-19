/**
 * Generate a bcrypt hash for a project password.
 * Usage: node scripts/hash-password.js "yourPassword"
 * Add the output to data/projects.json in the passwordHash field of your project.
 */
const bcrypt = require("bcryptjs");
const password = process.argv[2];
if (!password) {
  console.error("Usage: node scripts/hash-password.js \"yourPassword\"");
  process.exit(1);
}
const hash = bcrypt.hashSync(password, 10);
console.log(hash);
