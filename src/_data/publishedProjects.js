const projects = require("./projects.json");

module.exports = projects.filter(project => !project.draft);
