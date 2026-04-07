#!/usr/bin/env node

// Azure SDK MCP Server wrapper script.
// Downloads the azsdk CLI binary from GitHub Releases on first use,
// caches it locally, and spawns the MCP server with stdio inherited.
// Uses only Node.js built-ins — no npm install required.

const https = require("https");
const fs = require("fs");
const path = require("path");
const { execFileSync, spawn } = require("child_process");
const os = require("os");
const zlib = require("zlib");

const REPO = "Azure/azure-sdk-tools";
const PACKAGE_NAME = "azsdk";
const FILE_NAME = "Azure.Sdk.Tools.Cli";
const INSTALL_DIR =
  process.env.AZSDK_INSTALL_DIR || path.join(os.homedir(), ".azure-sdk-mcp");

// Map Node.js platform/arch to GitHub release RID and archive format.
function getPlatformMeta() {
  const platform = process.platform;
  const arch = process.arch;

  const map = {
    win32: {
      x64: { rid: "win-x64", ext: "zip", exe: `${PACKAGE_NAME}.exe` },
    },
    linux: {
      x64: { rid: "linux-x64", ext: "tar.gz", exe: PACKAGE_NAME },
      arm64: { rid: "linux-arm64", ext: "tar.gz", exe: PACKAGE_NAME },
    },
    darwin: {
      x64: { rid: "osx-x64", ext: "zip", exe: PACKAGE_NAME },
      arm64: { rid: "osx-arm64", ext: "zip", exe: PACKAGE_NAME },
    },
  };

  const platformMap = map[platform];
  if (!platformMap) throw new Error(`Unsupported platform: ${platform}`);
  const meta = platformMap[arch];
  if (!meta) throw new Error(`Unsupported architecture: ${arch} on ${platform}`);
  return meta;
}

// HTTPS GET with redirect following. Returns a Promise resolving to the response body.
function httpsGet(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "sdk-copilot-plugin" }, ...options }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpsGet(res.headers.location, options).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });
    req.on("error", reject);
  });
}

// Find the latest azsdk release tag from GitHub Releases API.
async function getLatestVersion() {
  const url = `https://api.github.com/repos/${REPO}/releases`;
  const body = await httpsGet(url, {
    headers: { "User-Agent": "sdk-copilot-plugin", Accept: "application/vnd.github+json" },
  });
  const releases = JSON.parse(body.toString());
  for (const release of releases) {
    if (release.tag_name && release.tag_name.startsWith(`${PACKAGE_NAME}_`)) {
      const version = release.tag_name.replace(`${PACKAGE_NAME}_`, "");
      return { tag: release.tag_name, version };
    }
  }
  throw new Error(`No release found for package '${PACKAGE_NAME}'`);
}

// Read the cached version from downloaded_version.txt, or null if not present.
function getCachedVersion() {
  const versionFile = path.join(INSTALL_DIR, "downloaded_version.txt");
  try {
    return fs.readFileSync(versionFile, "utf-8").trim();
  } catch {
    return null;
  }
}

// Extract a .tar.gz buffer to a directory.
function extractTarGz(buffer, destDir) {
  const tmpFile = path.join(os.tmpdir(), `azsdk-download-${Date.now()}.tar.gz`);
  fs.writeFileSync(tmpFile, buffer);
  try {
    execFileSync("tar", ["-xzf", tmpFile, "-C", destDir], { stdio: "ignore" });
  } finally {
    fs.unlinkSync(tmpFile);
  }
}

// Extract a .zip buffer to a directory.
function extractZip(buffer, destDir) {
  const tmpFile = path.join(os.tmpdir(), `azsdk-download-${Date.now()}.zip`);
  fs.writeFileSync(tmpFile, buffer);
  try {
    if (process.platform === "win32") {
      execFileSync("powershell", [
        "-NoProfile", "-Command",
        `Expand-Archive -Path '${tmpFile}' -DestinationPath '${destDir}' -Force`,
      ], { stdio: "ignore" });
    } else {
      execFileSync("unzip", ["-o", tmpFile, "-d", destDir], { stdio: "ignore" });
    }
  } finally {
    fs.unlinkSync(tmpFile);
  }
}

async function ensureInstalled() {
  const meta = getPlatformMeta();
  const { tag, version } = await getLatestVersion();
  const cachedVersion = getCachedVersion();

  const exePath = path.join(INSTALL_DIR, meta.exe);

  if (cachedVersion === version && fs.existsSync(exePath)) {
    return exePath;
  }

  // Ensure install directory exists.
  fs.mkdirSync(INSTALL_DIR, { recursive: true });

  const fileName = `${FILE_NAME}-standalone-${meta.rid}.${meta.ext}`;
  const downloadUrl = `https://github.com/${REPO}/releases/download/${tag}/${fileName}`;

  process.stderr.write(`Installing ${PACKAGE_NAME} ${version} from ${downloadUrl}\n`);

  const buffer = await httpsGet(downloadUrl);

  if (meta.ext === "tar.gz") {
    extractTarGz(buffer, INSTALL_DIR);
  } else {
    extractZip(buffer, INSTALL_DIR);
  }

  // Set executable permission on non-Windows.
  if (process.platform !== "win32") {
    fs.chmodSync(exePath, 0o755);
  }

  // Record the installed version.
  fs.writeFileSync(path.join(INSTALL_DIR, "downloaded_version.txt"), version);

  process.stderr.write(`Installed ${PACKAGE_NAME} to ${exePath}\n`);
  return exePath;
}

async function main() {
  try {
    const exePath = await ensureInstalled();
    // Pass all CLI args after this script to the azsdk binary (e.g. "mcp").
    const args = process.argv.slice(2);
    const child = spawn(exePath, args, {
      stdio: "inherit",
      env: { ...process.env },
    });
    child.on("exit", (code) => process.exit(code ?? 1));
    child.on("error", (err) => {
      process.stderr.write(`Failed to start ${PACKAGE_NAME}: ${err.message}\n`);
      process.exit(1);
    });
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }
}

main();
