/// <reference lib="webworker" />

import {
  runDiagView2VirtualForwardModel,
  type DiagView2DiagnosticDesign,
  type DiagView2GeqdskData,
  type DiagView2MathProfile,
  type DiagView2VirtualForwardProgress,
} from './ehl2DiagView2Core';

type ForwardWorkerRequest = {
  type: 'run';
  requestId: string;
  design: DiagView2DiagnosticDesign;
  gfile: DiagView2GeqdskData;
  profile: DiagView2MathProfile;
};

type WorkerScope = DedicatedWorkerGlobalScope;
const scope = self as unknown as WorkerScope;

scope.onmessage = (event: MessageEvent<ForwardWorkerRequest>) => {
  const request = event.data;
  if (!request || request.type !== 'run' || !request.requestId) {
    scope.postMessage({ type: 'error', requestId: request?.requestId ?? '', error: 'Invalid virtual-forward worker request.' });
    return;
  }
  try {
    const result = runDiagView2VirtualForwardModel(request.design, request.gfile, request.profile, {
      stepM: 0.005,
      maxLengthM: 10,
      maxTotalSamples: 2_000_000,
      control: {
        onProgress: (progress: DiagView2VirtualForwardProgress) => {
          scope.postMessage({ type: 'progress', requestId: request.requestId, progress });
        },
      },
    });
    const signals = result.signals;
    const normalizedSignals = result.normalizedSignals;
    scope.postMessage({
      type: 'result',
      requestId: request.requestId,
      result: {
        authority: result.authority,
        model: result.model,
        stepM: result.stepM,
        maxLengthM: result.maxLengthM,
        rays: result.rays,
        signals,
        normalizedSignals,
        normalizationReferenceSignal: result.normalizationReferenceSignal,
        signalUnit: result.signalUnit,
        warnings: result.warnings,
      },
    }, [signals.buffer, normalizedSignals.buffer]);
  } catch (error) {
    scope.postMessage({
      type: 'error',
      requestId: request.requestId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export {};
