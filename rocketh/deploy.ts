import {
  type Accounts,
  type Data,
  type Extensions,
  extensions,
} from "./config.js";

// ----------------------------------------------------------------------------
// we create the rocketh functions we need by passing the extensions to the
//  setup function
  import { setupDeployScripts } from "rocketh";
const { deployScript } = setupDeployScripts<Extensions, Accounts, Data>(
  extensions,
);

export { deployScript };
