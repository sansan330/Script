#!/usr/bin/env node
/**
 * 学习通作业粘贴解禁 - 自动化启动器
 * 补丁逻辑直接复用 chaoxing-patch.user.js，避免两套代码不一致。
 * 用法：node chaoxing-patch.mjs
 */
import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const here = dirname(fileURLToPath(import.meta.url));
const userScript = readFileSync(join(here, 'chaoxing-patch.user.js'), 'utf8')
    // 去掉油猴头部，只保留 IIFE 主体
    .replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/, '');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const userDataDir = join(homedir(), 'AppData', 'Local', 'Temp', 'rea-chaoxing-patch');

console.log('[REA-Patch] 启动 Chrome...');
const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: chromePath,
    headless: false,
    viewport: { width: 1400, height: 900 },
    args: ['--no-first-run', '--no-default-browser-check', '--disable-blink-features=AutomationControlled'],
    ignoreHTTPSErrors: true,
});

await context.addInitScript(userScript);
context.on('page', async (p) => { try { await p.addInitScript(userScript); } catch (e) {} });

const page = context.pages()[0] || await context.newPage();
await page.goto('https://i.chaoxing.com/', { waitUntil: 'domcontentloaded' });

console.log('[REA-Patch] 已打开学习通，请登录并进入作业页面。');
console.log('[REA-Patch] 若未生效，在 Console 执行：window.__reaUnblockPaste()');

const close = async () => { try { await context.close(); } finally { process.exit(0); } };
process.on('SIGINT', close);
process.on('SIGTERM', close);
await new Promise(() => {});
