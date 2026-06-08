import {useEffect} from 'react';

const GITHUB_LATEST_RELEASE_API = 'https://api.github.com/repos/DSPCalculator/dsp-calc/releases/latest';
const OFFLINE_ZIP_PATTERN = /offline-v?[\d.]+.*\.zip$/i;

interface GitHubReleaseAsset {
    name: string;
    browser_download_url: string;
}

interface GitHubLatestRelease {
    tag_name?: string;
    html_url?: string;
    assets?: GitHubReleaseAsset[];
}

function parseVersion(version: string): number[] {
    return version
        .replace(/^v/i, '')
        .split(/[.+-]/)
        .map(part => Number.parseInt(part, 10))
        .filter(part => Number.isFinite(part));
}

function isNewerVersion(candidate: string, current: string): boolean {
    const candidate_parts = parseVersion(candidate);
    const current_parts = parseVersion(current);
    const length = Math.max(candidate_parts.length, current_parts.length);
    for (let index = 0; index < length; index += 1) {
        const candidate_part = candidate_parts[index] || 0;
        const current_part = current_parts[index] || 0;
        if (candidate_part > current_part) {
            return true;
        }
        if (candidate_part < current_part) {
            return false;
        }
    }
    return false;
}

function selectOfflineAsset(release: GitHubLatestRelease): GitHubReleaseAsset | undefined {
    return release.assets?.find(asset => OFFLINE_ZIP_PATTERN.test(asset.name))
        ?? release.assets?.find(asset => asset.name.toLowerCase().endsWith('.zip'));
}

function downloadUrl(url: string): void {
    const link = document.createElement('a');
    link.href = url;
    link.download = '';
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

export function OfflineUpdateChecker() {
    useEffect(() => {
        if (import.meta.env.DEV || window.location.protocol !== 'file:') {
            return;
        }

        const current_version = import.meta.env.VITE_APP_VERSION;
        let canceled = false;

        async function checkOfflineUpdate() {
            try {
                const response = await fetch(GITHUB_LATEST_RELEASE_API, {cache: 'no-store'});
                if (!response.ok) {
                    return;
                }
                const release = await response.json() as GitHubLatestRelease;
                const latest_version = release.tag_name || '';
                if (!latest_version || !isNewerVersion(latest_version, current_version) || canceled) {
                    return;
                }

                const offline_asset = selectOfflineAsset(release);
                const download_url = offline_asset?.browser_download_url || release.html_url;
                if (!download_url) {
                    return;
                }

                const confirmed = window.confirm(
                    `检测到离线版新版本 ${latest_version}，当前版本 ${current_version}。\n\n` +
                    `确认后会下载最新离线包；下载完成后请解压并替换当前离线目录。`
                );
                if (confirmed && !canceled) {
                    downloadUrl(download_url);
                }
            } catch {
                // 离线启动或 GitHub 不可访问时静默跳过，避免打断计算器使用。
            }
        }

        window.setTimeout(checkOfflineUpdate, 1000);
        return () => {
            canceled = true;
        };
    }, []);

    return null;
}
