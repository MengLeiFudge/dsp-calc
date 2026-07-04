import {useEffect, useState} from 'react';

const GITHUB_LATEST_RELEASE_API = 'https://api.github.com/repos/DSPCalculator/dsp-calc/releases/latest';
const OFFLINE_ZIP_PATTERN = /offline-v?[\d.]+.*\.zip$/i;

type TauriUpdate = import('@tauri-apps/plugin-updater').Update;

interface GitHubReleaseAsset {
    name: string;
    browser_download_url: string;
}

interface GitHubLatestRelease {
    tag_name?: string;
    html_url?: string;
    assets?: GitHubReleaseAsset[];
}

type StaticUpdateInfo = {
    kind: 'static';
    latestVersion: string;
    currentVersion: string;
    downloadUrl: string;
};

type DesktopUpdateInfo = {
    kind: 'desktop';
    update: TauriUpdate;
};

type UpdateInfo = StaticUpdateInfo | DesktopUpdateInfo;

type DownloadState = 'idle' | 'downloading' | 'downloaded' | 'installing' | 'failed';

function isTauriRuntime(): boolean {
    return Boolean((window as Window & {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__);
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
    const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
    const [downloadState, setDownloadState] = useState<DownloadState>('idle');
    const [downloadError, setDownloadError] = useState('');
    const [downloadedDesktopUpdate, setDownloadedDesktopUpdate] = useState<TauriUpdate | null>(null);

    useEffect(() => {
        if (import.meta.env.DEV) {
            return;
        }

        const current_version = import.meta.env.VITE_APP_VERSION;
        let canceled = false;

        async function checkDesktopUpdate() {
            try {
                const {check} = await import('@tauri-apps/plugin-updater');
                const update = await check();
                if (!canceled && update?.available) {
                    setUpdateInfo({kind: 'desktop', update});
                }
            } catch {
                // 更新服务不可访问或签名配置缺失时静默跳过，避免影响桌面版正常使用。
            }
        }

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

                setUpdateInfo({
                    kind: 'static',
                    latestVersion: latest_version,
                    currentVersion: current_version,
                    downloadUrl: download_url,
                });
            } catch {
                // 离线启动或 GitHub 不可访问时静默跳过，避免打断计算器使用。
            }
        }

        const timer = window.setTimeout(() => {
            if (isTauriRuntime()) {
                void checkDesktopUpdate();
                return;
            }
            if (window.location.protocol === 'file:') {
                void checkOfflineUpdate();
            }
        }, 1000);

        return () => {
            canceled = true;
            window.clearTimeout(timer);
        };
    }, []);

    async function downloadDesktopUpdate(update: TauriUpdate) {
        setDownloadState('downloading');
        setDownloadError('');
        try {
            await update.download();
            setDownloadedDesktopUpdate(update);
            setDownloadState('downloaded');
        } catch (error) {
            setDownloadState('failed');
            setDownloadError(error instanceof Error ? error.message : '下载更新失败');
        }
    }

    async function installDesktopUpdate() {
        if (!downloadedDesktopUpdate) {
            return;
        }
        setDownloadState('installing');
        setDownloadError('');
        try {
            const {relaunch} = await import('@tauri-apps/plugin-process');
            await downloadedDesktopUpdate.install();
            await relaunch();
        } catch (error) {
            setDownloadState('failed');
            setDownloadError(error instanceof Error ? error.message : '安装更新失败');
        }
    }

    if (!updateInfo) {
        return null;
    }

    if (updateInfo.kind === 'static') {
        return <div className="offline-update-toast" role="status" aria-live="polite">
            <div className="offline-update-title">检测到离线版新版本 {updateInfo.latestVersion}</div>
            <div className="offline-update-body">
                当前版本 {updateInfo.currentVersion}。下载最新离线包后，请手动解压并覆盖当前离线目录。
            </div>
            <div className="offline-update-actions">
                <button type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => {
                            downloadUrl(updateInfo.downloadUrl);
                            setUpdateInfo(null);
                        }}>
                    下载更新包
                </button>
                <button type="button"
                        className="btn btn-outline-secondary btn-sm"
                        onClick={() => setUpdateInfo(null)}>
                    稍后
                </button>
            </div>
        </div>;
    }

    const latestVersion = updateInfo.update.version;
    return <div className="offline-update-toast" role="status" aria-live="polite">
        <div className="offline-update-title">检测到桌面版新版本 {latestVersion}</div>
        <div className="offline-update-body">
            {downloadState === 'idle' && '可以在后台下载更新包，下载完成后再确认安装并重启应用。'}
            {downloadState === 'downloading' && '正在后台下载更新包...'}
            {downloadState === 'downloaded' && '更新包已下载完成，是否现在安装并重启应用？'}
            {downloadState === 'installing' && '正在安装更新并准备重启...'}
            {downloadState === 'failed' && (downloadError || '更新失败')}
        </div>
        <div className="offline-update-actions">
            {downloadState === 'idle' &&
                <button type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => void downloadDesktopUpdate(updateInfo.update)}>
                    下载更新包
                </button>}
            {downloadState === 'downloaded' &&
                <button type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => void installDesktopUpdate()}>
                    安装并重启
                </button>}
            {downloadState !== 'downloading' && downloadState !== 'installing' &&
                <button type="button"
                        className="btn btn-outline-secondary btn-sm"
                        onClick={() => setUpdateInfo(null)}>
                    稍后
                </button>}
        </div>
    </div>;
}
