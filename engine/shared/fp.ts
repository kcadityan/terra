export type Left<L> = { readonly _tag: 'Left'; readonly left: L };
export type Right<R> = { readonly _tag: 'Right'; readonly right: R };
export type Either<L, R> = Left<L> | Right<R>;

export const left = <L, R = never>(leftValue: L): Either<L, R> => ({ _tag: 'Left', left: leftValue });
export const right = <R, L = never>(rightValue: R): Either<L, R> => ({ _tag: 'Right', right: rightValue });

export const isRight = <L, R>(value: Either<L, R>): value is Right<R> => value._tag === 'Right';
export const isLeft = <L, R>(value: Either<L, R>): value is Left<L> => value._tag === 'Left';

export const map = <L, A, B>(fa: Either<L, A>, f: (a: A) => B): Either<L, B> =>
  isRight(fa) ? right(f(fa.right)) : fa;

export const chain = <L, A, B>(fa: Either<L, A>, f: (a: A) => Either<L, B>): Either<L, B> =>
  isRight(fa) ? f(fa.right) : fa;

export const fold = <L, A, B>(fa: Either<L, A>, onLeft: (l: L) => B, onRight: (a: A) => B): B =>
  (isRight(fa) ? onRight(fa.right) : onLeft((fa as Left<L>).left));

export const liftEither = <L, A>(f: () => A, onError: (err: unknown) => L): Either<L, A> => {
  try {
    return right(f());
  } catch (err) {
    return left(onError(err));
  }
};

export function pipe<A>(value: A): A;
export function pipe<A, B>(value: A, ab: (a: A) => B): B;
export function pipe<A, B, C>(value: A, ab: (a: A) => B, bc: (b: B) => C): C;
export function pipe<A, B, C, D>(
  value: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
): D;
export function pipe<A, B, C, D, E>(
  value: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
): E;
export function pipe(value: unknown, ...ops: Array<(input: unknown) => unknown>): unknown {
  return ops.reduce((acc, fn) => fn(acc), value);
}

export const then = <L, A, B>(f: (a: A) => Either<L, B>) =>
  (fa: Either<L, A>): Either<L, B> => chain(fa, f);

export const mapEither = <L, A, B>(f: (a: A) => B) =>
  (fa: Either<L, A>): Either<L, B> => map(fa, f);

export type Validation<L, A> = {
  readonly _tag: 'Validation';
  readonly errors: ReadonlyArray<L>;
  readonly value?: A;
};

export const success = <L, A>(value: A): Validation<L, A> => ({ _tag: 'Validation', errors: [], value });
export const failure = <L, A = never>(...errors: ReadonlyArray<L>): Validation<L, A> => ({
  _tag: 'Validation',
  errors,
});

export const isSuccess = <L, A>(validation: Validation<L, A>): validation is Validation<L, A> & { value: A } =>
  validation.errors.length === 0;

export const combineValidations = <L, A extends Record<string, unknown>>(
  parts: { [K in keyof A]: Validation<L, A[K]> },
): Validation<L, { [K in keyof A]: A[K] }> => {
  const errors: L[] = [];
  const result: Partial<A> = {};
  for (const key in parts) {
    const part = parts[key];
    if (part.errors.length > 0) {
      errors.push(...part.errors);
    } else if (part.value !== undefined) {
      result[key] = part.value as A[typeof key];
    }
  }
  return errors.length === 0 ? success(result as { [K in keyof A]: A[K] }) : failure(...errors);
};
