/**
 * React adapter - subpath export (`@toggleflow/sdk/react`) so React stays an
 * optional peer dependency; the main entry never imports it.
 */
import type { JsonObject } from '@toggleflow/engine';
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from 'react';

import type { EvaluatedFlag, ToggleFlowBrowserClient } from './browser';

const ToggleFlowContext = createContext<ToggleFlowBrowserClient | null>(null);

export interface ToggleFlowProviderProps {
  client: ToggleFlowBrowserClient;
  children?: ReactNode;
}

export function ToggleFlowProvider(props: ToggleFlowProviderProps): ReactElement {
  return createElement(ToggleFlowContext.Provider, { value: props.client }, props.children);
}

export function useToggleFlowClient(): ToggleFlowBrowserClient {
  const client = useContext(ToggleFlowContext);
  if (!client) {
    throw new Error('ToggleFlow: wrap your tree in <ToggleFlowProvider client={...}>');
  }
  return client;
}

/** The full evaluated flag (enabled + config + fallback); re-renders on change. */
export function useFlagDetails(toolKey: string): EvaluatedFlag | undefined {
  const client = useToggleFlowClient();
  const subscribe = useCallback(
    (onStoreChange: () => void) => client.subscribe(onStoreChange),
    [client],
  );
  const read = useCallback(() => client.getFlag(toolKey), [client, toolKey]);
  return useSyncExternalStore(subscribe, read, read);
}

/** `false` while loading or when the tool is disabled/unknown - safe default. */
export function useFlag(toolKey: string): boolean {
  return useFlagDetails(toolKey)?.enabled ?? false;
}

/** The tool's live config value, or null. */
export function useConfig(toolKey: string): JsonObject | null {
  return useFlagDetails(toolKey)?.config ?? null;
}
