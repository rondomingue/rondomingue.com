const fs = require("node:fs");
const path = require("node:path");

module.exports = function() {
  const projectsPath = path.join(__dirname, "projects.json");
  const projects = JSON.parse(fs.readFileSync(projectsPath, "utf8"));

  return projects.filter(project => !project.draft);
};
