import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const manifestPath = path.join(root, "tests/visual-regression/manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const outputRoot = path.resolve(
  process.env.VISUAL_OUTPUT_DIR ?? "artifacts/visual-regression",
);
const v1Root = path.resolve(process.env.V1_ROOT ?? ".audit/v1");
const v2Root = path.resolve(
  process.env.V2_ROOT ?? "apps/morro-digital-platform/public",
);
const playwrightVersion = process.env.PLAYWRIGHT_VERSION ?? "1.55.0";

function startServer(directory, port) {
  const server = spawn(
    "python3",
    [
      "-m",
      "http.server",
      String(port),
      "--bind",
      "127.0.0.1",
      "--directory",
      directory,
    ],
    { stdio: "inherit" },
  );

  server.on("exit", (code) => {
    if (code && code !== 0) process.exitCode = code;
  });

  return server;
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with ${result.status}`);
  }
}

async function waitFor(url) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

function capture(url, viewport, target) {
  run("npx", [
    "--yes",
    `playwright@${playwrightVersion}`,
    "screenshot",
    "--browser",
    "chromium",
    "--viewport-size",
    `${viewport.width},${viewport.height}`,
    "--wait-for-timeout",
    "1500",
    url,
    target,
  ]);
}

function parseAbsoluteError(metricOutput) {
  const normalized = metricOutput.trim();
  const match = normalized.match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/i);
  const value = match ? Number.parseFloat(match[0]) : Number.NaN;

  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid ImageMagick AE metric: ${normalized || "<empty>"}`);
  }

  return Math.round(value);
}

function compareImages(baseline, current, diff) {
  const result = spawnSync(
    "compare",
    ["-metric", "AE", baseline, current, diff],
    { encoding: "utf8" },
  );

  if (![0, 1].includes(result.status ?? 2)) {
    throw new Error(result.stderr || "ImageMagick compare failed");
  }

  return parseAbsoluteError(result.stderr || "0");
}

await mkdir(outputRoot, { recursive: true });
run("npx", ["--yes", `playwright@${playwrightVersion}`, "install", "chromium"]);

const v1Server = startServer(v1Root, 4171);
const v2Server = startServer(v2Root, 4172);

try {
  await Promise.all([
    waitFor("http://127.0.0.1:4171/"),
    waitFor("http://127.0.0.1:4172/"),
  ]);

  const report = {
    generatedAt: new Date().toISOString(),
    manifestVersion: manifest.version,
    destinationId: manifest.destinationId,
    captureMode: "viewport",
    metric: "ImageMagick AE",
    results: [],
  };

  for (const journey of manifest.journeys) {
    for (const viewport of manifest.viewports) {
      const directory = path.join(outputRoot, journey.id, viewport.id);
      await mkdir(directory, { recursive: true });

      const baseline = path.join(directory, "baseline.png");
      const current = path.join(directory, "current.png");
      const diff = path.join(directory, "diff.png");
      const route = journey.route.startsWith("/")
        ? journey.route
        : `/${journey.route}`;

      capture(`http://127.0.0.1:4171${route}`, viewport, baseline);
      capture(`http://127.0.0.1:4172${route}`, viewport, current);

      const differentPixels = compareImages(baseline, current, diff);
      const totalPixels = viewport.width * viewport.height;
      const pixelRatio = differentPixels / totalPixels;
      const passed =
        differentPixels <= journey.threshold.maxDifferentPixels &&
        pixelRatio <= journey.threshold.pixelRatio;

      report.results.push({
        journeyId: journey.id,
        viewportId: viewport.id,
        width: viewport.width,
        height: viewport.height,
        totalPixels,
        differentPixels,
        pixelRatio,
        passed,
        artifacts: {
          baseline: path.relative(outputRoot, baseline),
          current: path.relative(outputRoot, current),
          diff: path.relative(outputRoot, diff),
        },
      });
    }
  }

  report.passed = report.results.every((result) => result.passed);

  await writeFile(
    path.join(outputRoot, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  console.log(JSON.stringify(report, null, 2));
} finally {
  v1Server.kill("SIGTERM");
  v2Server.kill("SIGTERM");
}
