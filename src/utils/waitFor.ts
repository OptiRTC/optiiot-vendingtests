//waitFor(): wait for `ms` milliseconds
//* If an abortSignal is provided, the wait can be aborted
export const waitFor = async (
  ms: number,
  //Pass in signal property from an AbortController
  signal?: AbortSignal
): Promise<void> =>
  new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      resolve();
      if (removeAbortHandler) {
        removeAbortHandler();
      }
    }, ms);
    let removeAbortHandler: () => void;
    if (signal) {
      const abortHandler = () => {
        clearTimeout(timeoutId);
        reject(new Error(`waitFor ${ms} ms was aborted`));
      };

      signal.addEventListener('abort', abortHandler);
      removeAbortHandler = () => {
        signal.removeEventListener('abort', abortHandler);
      };
    }
  });
