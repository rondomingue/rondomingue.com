module.exports = function(eleventyConfig) {
  eleventyConfig.addFilter("isoDate", (date) => {
    return new Date(date).toISOString().slice(0, 10);
  });

  eleventyConfig.addFilter("inlineLinks", value => String(value || "").replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>'));

  eleventyConfig.addFilter("randomProjects", (projects, count = 6) => {
    const shuffled = [...projects];

    for (let index = shuffled.length - 1; index > 0; index--) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
    }

    return shuffled.slice(0, count);
  });

  const getAdjacentProject = (projects = [], slug, direction = 1) => {
  if (!Array.isArray(projects) || !projects.length) return null;
  const index = projects.findIndex(project => project.slug === slug);
  if (index < 0) return null;
  return projects[(index + direction + projects.length) % projects.length];
  };

  eleventyConfig.addFilter("previousProject", (projects, slug) => getAdjacentProject(projects, slug, -1));
  eleventyConfig.addFilter("nextProject", (projects, slug) => getAdjacentProject(projects, slug, 1));

  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy("src/images");
  eleventyConfig.addPassthroughCopy("src/fonts");
  eleventyConfig.addPassthroughCopy("src/js");
  eleventyConfig.addWatchTarget("src/css/");
  eleventyConfig.addWatchTarget("src/js/");

  return {
    pathPrefix: "/",
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data"
    },
    templateFormats: ["njk", "html", "md"],
    htmlTemplateEngine: "njk"
  };
};
