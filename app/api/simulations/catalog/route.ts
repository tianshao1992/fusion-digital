import { engines, recipes } from '../../../simulations/platform/catalog';
import runs from '../../../simulations/data/transport-runs.json';
export function GET() {
  return Response.json({ schema: 'engine-catalog.v1', engines, recipes, runs, execution: 'local-authenticated-gateway', anonymousExecution: false });
}
