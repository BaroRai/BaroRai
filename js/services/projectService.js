const PROJECTS_URL = new URL("../../data/projects.json", import.meta.url);

export async function getProjects() {
  const response = await fetch(PROJECTS_URL);
  if (!response.ok) throw new Error(`Could not load projects (${response.status})`);
  return response.json();
}
