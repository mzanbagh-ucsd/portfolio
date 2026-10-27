import { fetchJSON, renderProjects, fetchGitHubData } from './global.js';

const projects = await fetchJSON('./lib/projects.json');
const latestProjects = projects.slice(0, 3);
const projectsContainer = document.querySelector('.projects');
renderProjects(latestProjects, projectsContainer, 'h2');

const profileStats = document.querySelector('#profile-stats');
try {
  const githubData = await fetchGitHubData('mzanbagh-ucsd');

  if (profileStats && githubData.login) {
    profileStats.innerHTML = `
      <dl>
        <dt>Public repos</dt><dd>${githubData.public_repos}</dd>
        <dt>Public gists</dt><dd>${githubData.public_gists}</dd>
        <dt>Followers</dt><dd>${githubData.followers}</dd>
        <dt>Following</dt><dd>${githubData.following}</dd>
      </dl>
    `;
  } else if (profileStats) {
    profileStats.textContent = 'GitHub stats are unavailable right now.';
  }
} catch (error) {
  console.error('Error displaying GitHub profile data:', error);
  if (profileStats) {
    profileStats.textContent = 'GitHub stats are unavailable right now.';
  }
}
