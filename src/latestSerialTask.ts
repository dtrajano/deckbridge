export class LatestSerialTask {
  private generation = 0;
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T | undefined> {
    const generation = ++this.generation;
    const result = this.tail.then(() => generation === this.generation ? task() : undefined);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }
}
