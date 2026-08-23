interface RegisterSwOptions {
  readonly immediate?: boolean;
  readonly onNeedReload?: () => void;
  readonly onNeedRefresh?: () => void;
  readonly onOfflineReady?: () => void;
  readonly onRegisteredSW?: (
    swUrl: string,
    registration: ServiceWorkerRegistration | undefined,
  ) => void;
  readonly onRegisterError?: (error: unknown) => void;
}

export function registerSW(
  options: RegisterSwOptions = {},
): (reloadPage?: boolean) => Promise<void> {
  void options;
  return () => Promise.resolve();
}
