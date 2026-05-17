/**
 * Face detection + 128-D embedding service. The default implementation lazy-
 * loads `@tensorflow/tfjs-node` and `@vladmandic/face-api`, reading models from
 * `MODEL_DIR` (see `env.ts`). Other code should depend on `FaceEngine` so
 * tests can inject deterministic mocks via DI.
 *
 * The dynamic imports below are typed as `any` so the test path (and tsc)
 * does not require the heavyweight binaries to be installed. Operators must
 * `pnpm --filter backend add @tensorflow/tfjs-node @vladmandic/face-api` and
 * run `node scripts/download-models.mjs` before turning on the worker loop.
 */

export interface FaceEngine {
  /** Returns one 128-D embedding per detected face, in detection order. */
  detectAndEmbed(image: Buffer): Promise<number[][]>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = any;

async function loadDeps(): Promise<{ tf: AnyMod; faceapi: AnyMod }> {
  const tf = (await import(/* @vite-ignore */ "@tensorflow/tfjs-node" as string).catch(
    () => null,
  )) as AnyMod;
  if (!tf) {
    throw new Error(
      "@tensorflow/tfjs-node is not installed. Install tfjs-node + @vladmandic/face-api on the backend host before enabling the worker.",
    );
  }
  const faceapi = (await import(
    /* @vite-ignore */ "@vladmandic/face-api" as string
  )) as AnyMod;
  return { tf, faceapi };
}

class LazyFaceApiEngine implements FaceEngine {
  private booted = false;
  private faceapi: AnyMod = null;

  constructor(private readonly modelDir: string) {}

  private async boot() {
    if (this.booted) return;
    const { faceapi } = await loadDeps();
    await faceapi.nets.ssdMobilenetv1.loadFromDisk(this.modelDir);
    await faceapi.nets.faceLandmark68Net.loadFromDisk(this.modelDir);
    await faceapi.nets.faceRecognitionNet.loadFromDisk(this.modelDir);
    this.faceapi = faceapi;
    this.booted = true;
  }

  async detectAndEmbed(image: Buffer): Promise<number[][]> {
    await this.boot();
    const { tf } = await loadDeps();
    const tensor = tf.node.decodeImage(image, 3);
    try {
      const results = await this.faceapi
        .detectAllFaces(tensor, new this.faceapi.SsdMobilenetv1Options())
        .withFaceLandmarks()
        .withFaceDescriptors();
      return results.map((r: { descriptor: Float32Array }) =>
        Array.from(r.descriptor),
      );
    } finally {
      tensor?.dispose?.();
    }
  }
}

export function createFaceEngine(modelDir: string): FaceEngine {
  return new LazyFaceApiEngine(modelDir);
}
