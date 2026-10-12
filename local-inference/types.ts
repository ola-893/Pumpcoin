export type Progress = { phase: 'inspecting' | 'weights' | 'runtime' | 'checking'; completedBytes: number; totalBytes: number };
export type Detection = {
  model: string; endpoint: string; quantization: string; context: number; build: string;
  weightsHash: string; weightsBytes: number; weightsFilename: string; runtimeHash: string;
  runtimeManifest: { version: string; scope: string; build: string; artifacts: Array<{ name: string; sha256: string; bytes: number }> };
  source?: string; sourceStatus: 'local-download-record-matched' | 'unavailable';
  checkedAt: string; evidence: 'locally-detected-not-attested';
};
