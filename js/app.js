import { renderProjects } from "./components/projectList.js";
import { getProjects } from "./services/projectService.js";

const PROFILE = {
  // TODO: Update the profile information below
  email: "daniel.vasko.swe@gmail.com",
  github: "https://github.com/BaroRai",
  linkedin: "https://www.linkedin.com/in/daniel-va%C5%A1ko-b42143197/?lipi=urn%3Ali%3Apage%3Ad_flagship3_profile_view_base_contact_details%3BQmyLYXXtRk%2BaqawBrvPZGw%3D%3D",
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
