export function ensure(x) {
  if (x === undefined || x === null) {
    throw new Error();
  }
  return x;
}

export const tuple = (...args) => args;
