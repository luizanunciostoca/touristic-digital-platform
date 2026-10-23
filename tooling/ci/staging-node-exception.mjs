import { runStagingNodeCli } from "./staging-node-runtime.mjs";

export * from "./staging-node-contracts.mjs";
export * from "./staging-node-receipts.mjs";
export * from "./staging-node-barrier.mjs";
export * from "./staging-node-dispatch.mjs";
export * from "./staging-node-acceptance.mjs";
export { nodeRuntime } from "./staging-node-runtime.mjs";

if (
  process.argv[1] &&
  import.meta.url === new URL("file:" + process.argv[1]).href
)
  runStagingNodeCli(process.argv.slice(2)).catch(() => {
    console.error("ACCEPTANCE_MODE_GATE_FAILED");
    process.exitCode = 1;
  });
