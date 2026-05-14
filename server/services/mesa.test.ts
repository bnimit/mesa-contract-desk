import { mesa } from "./mesa.js";

async function smoke() {
  await mesa.init();

  await mesa.writeFile("main", "portfolio.json", JSON.stringify({ test: true }));
  const content = await mesa.readFile("main", "portfolio.json");
  console.assert(content.includes("test"), "read/write failed");

  await mesa.createBranch("agent/test-branch", "main");
  await mesa.writeFile("agent/test-branch", "portfolio.json", JSON.stringify({ modified: true }));
  const branchContent = await mesa.readFile("agent/test-branch", "portfolio.json");
  console.assert(branchContent.includes("modified"), "branch write failed");

  const mainContent = await mesa.readFile("main", "portfolio.json");
  console.assert(!mainContent.includes("modified"), "branch isolation failed");

  await mesa.mergeBranch("agent/test-branch", "main");
  const merged = await mesa.readFile("main", "portfolio.json");
  console.assert(merged.includes("modified"), "merge failed");

  await mesa.deleteBranch("agent/test-branch");

  console.log("All smoke tests passed");
}

smoke().catch(console.error);
