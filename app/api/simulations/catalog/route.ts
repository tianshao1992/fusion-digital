import { engines, recipes } from '../../../simulations/platform/catalog';
import runs from '../../../simulations/data/transport-runs.json';
import controlRuns from '../../../simulations/data/control-runs.json';
import controlExamples from '../../../simulations/data/control-examples.json';
import { controlRecipes } from '../../../simulations/control/contracts';
export function GET() {
  return Response.json({ schema: 'engine-catalog.v1', engines, recipes, runs, controlRecipes, controlRuns, controlExamples, execution: 'local-authenticated-gateway', anonymousExecution: false });
}
