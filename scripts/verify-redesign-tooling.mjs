import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(new URL("..", import.meta.url).pathname, "..");
const requiredSkills = [
  "design-taste-frontend",
  "redesign-existing-projects",
  "image-to-code",
  "web-design-guidelines",
];

const failures = [];

for (const skill of requiredSkills) {
  const file = path.join(root, ".agents", "skills", skill, "SKILL.md");
  if (!fs.existsSync(file)) failures.push(`missing ${path.relative(root, file)}`);
}

const codexConfig = path.join(root, ".codex", "config.toml");
if (!fs.existsSync(codexConfig)) {
  failures.push("missing .codex/config.toml");
} else {
  const config = fs.readFileSync(codexConfig, "utf8");
  if (!config.includes("[mcp_servers.context7]")) failures.push("Context7 MCP is not configured");
  if (!config.includes("[mcp_servers.chrome-devtools]")) failures.push("Chrome DevTools MCP is not configured");
}

if (failures.length) {
  console.error("Redesign tooling verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Redesign tooling verification passed.");
console.log("4 project skills present, Context7 configured, Chrome DevTools configured.");
