export type SingleFlight<T> = {
  isActive(): boolean;
  run(task: () => Promise<T>): Promise<T>;
};

export function createSingleFlight<T>(): SingleFlight<T> {
  let active: Promise<T> | null = null;

  return {
    isActive: () => active !== null,
    run(task) {
      if (active) return active;
      const request = Promise.resolve().then(task);
      active = request;
      const clear = () => {
        if (active === request) active = null;
      };
      request.then(clear, clear);
      return request;
    },
  };
}
