// Runs before `npm run dev` / `npm start`: fail early with a clear message on old Node versions.
const [major] = process.versions.node.split('.').map(Number);
if (major < 22) {
  console.error(`\n  Echo needs Node.js 22 or newer. You have ${process.version}.\n  Install the current LTS from https://nodejs.org, then run "npm install" and "npm run dev" again.\n`);
  process.exit(1);
}
