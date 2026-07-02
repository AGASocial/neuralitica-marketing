const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const sourceDir = path.join(root, "plan");
const targetDir = path.join(root, "public", "plan");

const files = ["PROVIDER_TIERS.html"];

fs.mkdirSync(targetDir, { recursive: true });

for (const file of files) {
  fs.copyFileSync(path.join(sourceDir, file), path.join(targetDir, file));
  console.log(`Synced plan/${file} → public/plan/${file}`);
}
