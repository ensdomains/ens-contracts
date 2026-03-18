import { setupEnvironmentFromFiles } from "@rocketh/node";
import { setupHardhatDeploy } from "hardhat-deploy/helpers";
import {
  extensions,
  type Accounts,
  type Data,
  type Extensions,
} from "./config.js";

// useful for test and scripts, uses file-system
const { loadAndExecuteDeploymentsFromFiles } = setupEnvironmentFromFiles<
  Extensions,
  Accounts,
  Data
>(extensions);
const { loadEnvironmentFromHardhat } = setupHardhatDeploy<
  Extensions,
  Accounts,
  Data
>(extensions);
export type Environment = Awaited<ReturnType<typeof loadAndExecuteDeploymentsFromFiles>>

export { loadAndExecuteDeploymentsFromFiles, loadEnvironmentFromHardhat };
