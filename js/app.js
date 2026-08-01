import { renderProjects } from "./components/projectList.js";
import { getProjects } from "./services/projectService.js";

const PROFILE = {
  // Replace these placeholders before publishing your site.
  email: "your.email@example.com",
  github: "https://github.com/",
  linkedin: "https://www.linkedin.com/",
};

function initializeNavigation() {
  const button = document.querySelector("[data-menu]");
  const nav = document.querySelector("[data-nav]");
  if (!button || !nav) return;
  button.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    button.setAttribute("aria-expanded", String(open));
  });
  nav.addEventListener("click", () => {
    nav.classList.remove("open");
    button.setAttribute("aria-expanded", "false");
  });
}

async function initializeProjects() {
  const container = document.querySelector("[data-project-list]");
  if (!container) return;
  try {
    renderProjects(container, await getProjects());
  } catch (error) {
    container.textContent = "Projects could not be loaded. Please try again later.";
    console.error(error);
  }
}

document.querySelectorAll("[data-email-link]").forEach((link) => { link.href = `mailto:${PROFILE.email}`; });
document.querySelectorAll("[data-github-link]").forEach((link) => { link.href = PROFILE.github; });
document.querySelectorAll("[data-linkedin-link]").forEach((link) => { link.href = PROFILE.linkedin; });
document.querySelectorAll("[data-year]").forEach((year) => { year.textContent = new Date().getFullYear(); });
initializeNavigation();
initializeProjects();
