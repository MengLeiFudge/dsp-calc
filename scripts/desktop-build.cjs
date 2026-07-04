#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const {spawnSync} = require('child_process');

const defaultSigningKeyPath = path.join(os.homedir(), '.tauri', 'dsp-calculator.key');
const defaultCargoBinPath = path.join(os.homedir(), '.cargo', 'bin');

function resolveSigningKeyPath() {
    if (process.env.TAURI_SIGNING_PRIVATE_KEY || process.env.TAURI_SIGNING_PRIVATE_KEY_PATH) {
        return process.env.TAURI_SIGNING_PRIVATE_KEY_PATH;
    }

    if (fs.existsSync(defaultSigningKeyPath)) {
        return defaultSigningKeyPath;
    }

    throw new Error(
        `未找到 Tauri updater 签名私钥：${defaultSigningKeyPath}\n` +
        '请先执行：npm.cmd exec tauri signer generate -- -w %USERPROFILE%\\.tauri\\dsp-calculator.key --ci'
    );
}

function main() {
    const env = {...process.env};
    const signingKeyPath = resolveSigningKeyPath();
    if (signingKeyPath) {
        env.TAURI_SIGNING_PRIVATE_KEY_PATH = signingKeyPath;
        if (!env.TAURI_SIGNING_PRIVATE_KEY) {
            env.TAURI_SIGNING_PRIVATE_KEY = fs.readFileSync(signingKeyPath, 'utf8');
        }
        if (!Object.prototype.hasOwnProperty.call(env, 'TAURI_SIGNING_PRIVATE_KEY_PASSWORD')) {
            env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = '';
        }
    }
    if (process.platform === 'win32' && fs.existsSync(path.join(defaultCargoBinPath, 'cargo.exe'))) {
        env.Path = `${defaultCargoBinPath};${env.Path || env.PATH || ''}`;
    }

    const npmExecPath = process.env.npm_execpath;
    const command = npmExecPath ? process.execPath : (process.platform === 'win32' ? 'npx.cmd' : 'npx');
    const args = npmExecPath
        ? [npmExecPath, 'exec', 'tauri', 'build']
        : ['tauri', 'build'];

    const result = spawnSync(command, args, {
        cwd: process.cwd(),
        env,
        stdio: 'inherit',
    });

    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

main();
