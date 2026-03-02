const axios = require('axios');

const GITHUB_TOKEN = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
const GITHUB_API = 'https://api.github.com';
const TIMEOUT = 15000;

function getHeaders() {
  return {
    'Authorization': `token ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'Jarvis-Bot',
  };
}

async function getUsername() {
  const res = await axios.get(`${GITHUB_API}/user`, { headers: getHeaders(), timeout: TIMEOUT });
  return res.data.login;
}

function sanitizeRepoName(name) {
  let clean = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!clean || clean.length < 2) {
    clean = `jarvis-project-${Date.now()}`;
  }
  return clean.substring(0, 60);
}

async function createRepo(name, description) {
  const headers = getHeaders();
  try {
    const res = await axios.post(`${GITHUB_API}/user/repos`, {
      name,
      description,
      auto_init: true,
      private: false,
    }, { headers, timeout: TIMEOUT });
    return res.data;
  } catch (error) {
    if (error.response && error.response.status === 422) {
      const uniqueName = `${name}-${Date.now().toString(36)}`;
      console.log(`[GitHub] Repo "${name}" exists, trying "${uniqueName}"`);
      const res = await axios.post(`${GITHUB_API}/user/repos`, {
        name: uniqueName,
        description,
        auto_init: true,
        private: false,
      }, { headers, timeout: TIMEOUT });
      return res.data;
    }
    throw error;
  }
}

async function waitForBranch(owner, repo, branch, maxRetries = 5) {
  const headers = getHeaders();
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await axios.get(
        `${GITHUB_API}/repos/${owner}/${repo}/git/ref/heads/${branch}`,
        { headers, timeout: TIMEOUT }
      );
      return res.data;
    } catch (error) {
      if (error.response && error.response.status === 404 && i < maxRetries - 1) {
        console.log(`[GitHub] Branch not ready, retrying in ${(i + 1) * 2}s... (${i + 1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, (i + 1) * 2000));
      } else {
        throw error;
      }
    }
  }
}

async function pushFiles(owner, repo, defaultBranch, files) {
  const headers = getHeaders();
  const refData = await waitForBranch(owner, repo, defaultBranch);
  const latestCommitSha = refData.object.sha;

  const commitRes = await axios.get(
    `${GITHUB_API}/repos/${owner}/${repo}/git/commits/${latestCommitSha}`,
    { headers, timeout: TIMEOUT }
  );
  const baseTreeSha = commitRes.data.tree.sha;

  const tree = [];
  for (const file of files) {
    const blobRes = await axios.post(
      `${GITHUB_API}/repos/${owner}/${repo}/git/blobs`,
      { content: file.content, encoding: 'utf-8' },
      { headers, timeout: TIMEOUT }
    );
    tree.push({
      path: file.path,
      mode: '100644',
      type: 'blob',
      sha: blobRes.data.sha,
    });
  }

  const treeRes = await axios.post(
    `${GITHUB_API}/repos/${owner}/${repo}/git/trees`,
    { base_tree: baseTreeSha, tree },
    { headers, timeout: TIMEOUT }
  );

  const newCommitRes = await axios.post(
    `${GITHUB_API}/repos/${owner}/${repo}/git/commits`,
    { message: 'Initial project by Jarvis', tree: treeRes.data.sha, parents: [latestCommitSha] },
    { headers, timeout: TIMEOUT }
  );

  await axios.patch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/refs/heads/${defaultBranch}`,
    { sha: newCommitRes.data.sha },
    { headers, timeout: TIMEOUT }
  );
}

async function enableGitHubPages(owner, repo, branch) {
  const headers = getHeaders();
  try {
    await axios.post(
      `${GITHUB_API}/repos/${owner}/${repo}/pages`,
      { source: { branch, path: '/' } },
      { headers, timeout: TIMEOUT }
    );
  } catch (error) {
    if (error.response && error.response.status === 409) {
      console.log('[GitHub Pages] Already enabled');
    } else {
      throw error;
    }
  }
}

function validateFiles(files) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('No files generated');
  }
  return files.filter(f => {
    if (!f.path || typeof f.path !== 'string' || !f.content) return false;
    if (f.path.startsWith('/') || f.path.includes('..')) return false;
    if (f.content.length > 500000) return false;
    return true;
  });
}

async function deployToGitHubPages(name, description, files) {
  if (!GITHUB_TOKEN) {
    throw new Error('GITHUB_PERSONAL_ACCESS_TOKEN not configured');
  }

  const validFiles = validateFiles(files);
  if (validFiles.length === 0) {
    throw new Error('No valid files to deploy');
  }

  const username = await getUsername();
  const repoName = sanitizeRepoName(name);

  console.log(`[GitHub] Creating repo: ${repoName}`);
  const repoData = await createRepo(repoName, description);
  const actualName = repoData.name;
  const defaultBranch = repoData.default_branch || 'main';

  console.log(`[GitHub] Pushing ${validFiles.length} files to ${defaultBranch}`);
  await pushFiles(username, actualName, defaultBranch, validFiles);

  console.log(`[GitHub] Enabling Pages on ${defaultBranch}`);
  await enableGitHubPages(username, actualName, defaultBranch);

  const pagesUrl = `https://${username}.github.io/${actualName}`;
  const repoUrl = `https://github.com/${username}/${actualName}`;

  console.log(`[GitHub] Deployed: ${pagesUrl}`);
  return { pagesUrl, repoUrl, repoName: actualName };
}

async function deleteRepo(repoName) {
  if (!GITHUB_TOKEN) {
    throw new Error('GITHUB_PERSONAL_ACCESS_TOKEN not configured');
  }
  const username = await getUsername();
  const headers = getHeaders();

  const cleanName = repoName.includes('/') ? repoName.split('/').pop() : repoName;

  console.log(`[GitHub] Deleting repo: ${username}/${cleanName}`);
  await axios.delete(
    `${GITHUB_API}/repos/${username}/${cleanName}`,
    { headers, timeout: TIMEOUT }
  );
  console.log(`[GitHub] Repo deleted: ${cleanName}`);
  return { deleted: cleanName, owner: username };
}

async function listRepos() {
  if (!GITHUB_TOKEN) {
    throw new Error('GITHUB_PERSONAL_ACCESS_TOKEN not configured');
  }
  const headers = getHeaders();
  const res = await axios.get(`${GITHUB_API}/user/repos?per_page=100&sort=updated`, { headers, timeout: TIMEOUT });
  return res.data.map(r => ({ name: r.name, url: r.html_url, description: r.description || '', pages: r.has_pages }));
}

module.exports = { deployToGitHubPages, deleteRepo, listRepos };
