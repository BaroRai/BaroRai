function projectCard(project, index) {
  const article = document.createElement("article");
  article.className = "project";
  article.innerHTML = `
    <span class="project-number">${String(index + 1).padStart(2, "0")}</span>
    <h3></h3>
    <div class="project-copy"><p></p><div class="tags"></div></div>`;
  article.querySelector("h3").textContent = project.title;
  article.querySelector("p").textContent = project.description;
  if (project.url) {
    const link = document.createElement("a");
    link.className = "text-link";
    link.href = project.url;
    link.textContent = "Play Dutchman ↗";
    article.querySelector(".project-copy").append(link);
  }
  const tags = article.querySelector(".tags");
  project.technologies.forEach((technology) => {
    const tag = document.createElement("span");
    tag.textContent = technology;
    tags.append(tag);
  });
  return article;
}

export function renderProjects(container, projects) {
  container.replaceChildren(...projects.map(projectCard));
}
