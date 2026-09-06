import { type ReactNode, useCallback, useMemo, useRef } from "react";

import {
  type PartialViewportCommandHandlers,
  ViewportCommandContext,
  type ViewportCommandId,
} from "@/features/viewport/viewportCommandContext";

type ViewportCommandProviderProps = {
  children: ReactNode;
};

export function ViewportCommandProvider({
  children,
}: ViewportCommandProviderProps) {
  const commandsRef = useRef<PartialViewportCommandHandlers | null>(null);

  const registerViewportCommands = useCallback(
    (commands: PartialViewportCommandHandlers) => {
      commandsRef.current = commands;

      return () => {
        if (commandsRef.current === commands) {
          commandsRef.current = null;
        }
      };
    },
    [],
  );

  const runViewportCommand = useCallback((commandId: ViewportCommandId) => {
    commandsRef.current?.[commandId]?.();
  }, []);

  const value = useMemo(
    () => ({
      registerViewportCommands,
      runViewportCommand,
    }),
    [registerViewportCommands, runViewportCommand],
  );

  return (
    <ViewportCommandContext.Provider value={value}>
      {children}
    </ViewportCommandContext.Provider>
  );
}
