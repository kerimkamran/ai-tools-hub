"use client";

import { useActionState, useTransition, type FormEvent } from "react";

/**
 * useActionState for forms that must KEEP what the person typed when the
 * server says no. React 19 resets an uncontrolled form after a
 * `<form action={fn}>` submission completes -- including when the action
 * returned a validation error -- so an admin who mistypes one field would
 * lose the whole form. Submitting through onSubmit + startTransition calls
 * the same Server Action without that reset.
 */
export function useKeepAction<S>(
  action: (prev: Awaited<S>, formData: FormData) => Promise<S>,
  initial: Awaited<S>
): [Awaited<S>, (e: FormEvent<HTMLFormElement>) => void, boolean] {
  const [state, dispatch, pending] = useActionState<S, FormData>(action, initial);
  const [, start] = useTransition();
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (submitter?.name) fd.set(submitter.name, submitter.value);
    start(() => dispatch(fd));
  };
  return [state, onSubmit, pending];
}
