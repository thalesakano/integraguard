import { listScenarioIds } from "./load-scenarios.js";

console.log(`Scenarios available: ${listScenarioIds().length}`);
listScenarioIds().forEach((id) => console.log(`  - ${id}`));
