import axios from 'axios';
import { ICommitFix } from '../models/Incident';

const FIX_PREFIXES = /^(fix|hotfix|patch|bug|revert|rollback)/i;
const MAX_COMMITS = 15;
const MAX_FILES = 8;
const MAX_PATCH_CHARS = 600;

export async function fetchCommitsBetween(
  repo: string,
  since: Date,
  until: Date
): Promise<ICommitFix[]> {
  const token = process.env.GITHUB_TOKEN;
  if (!token || !repo) return [];

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
  };

  let commits: any[];
  try {
    const res = await axios.get(`https://api.github.com/repos/${repo}/commits`, {
      headers,
      params: { since: since.toISOString(), until: until.toISOString(), per_page: MAX_COMMITS },
    });
    commits = res.data;
  } catch {
    return [];
  }

  // Prioritize fix-prefixed commits, then take the rest up to MAX_COMMITS
  const sorted = [
    ...commits.filter((c: any) => FIX_PREFIXES.test(c.commit.message)),
    ...commits.filter((c: any) => !FIX_PREFIXES.test(c.commit.message)),
  ].slice(0, MAX_COMMITS);

  const results: ICommitFix[] = [];

  for (const c of sorted) {
    try {
      const detail = await axios.get(
        `https://api.github.com/repos/${repo}/commits/${c.sha}`,
        { headers }
      );
      results.push({
        sha: (c.sha as string).slice(0, 7),
        message: (c.commit.message as string).split('\n')[0],
        author: c.commit.author?.name || c.author?.login || 'unknown',
        url: c.html_url,
        files: (detail.data.files || []).slice(0, MAX_FILES).map((f: any) => ({
          filename: f.filename as string,
          patch: f.patch ? (f.patch as string).slice(0, MAX_PATCH_CHARS) : undefined,
        })),
      });
    } catch {
      // skip commits we can't fetch detail for
    }
  }

  return results;
}
