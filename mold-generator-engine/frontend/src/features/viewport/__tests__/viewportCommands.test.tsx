import { render } from "@testing-library/react";
import { useEffect } from "react";

import {
  type PartialViewportCommandHandlers,
  type ViewportCommandId,
  useViewportCommandRegistration,
  useViewportCommandRunner,
  ViewportCommandProvider,
} from "@/features/viewport";

function RegisterCommands({
  commands,
}: {
  commands: PartialViewportCommandHandlers;
}) {
  const registerViewportCommands = useViewportCommandRegistration();

  useEffect(
    () => registerViewportCommands(commands),
    [commands, registerViewportCommands],
  );

  return null;
}

function RunCommand({ commandId }: { commandId: ViewportCommandId }) {
  const runViewportCommand = useViewportCommandRunner();

  useEffect(() => {
    runViewportCommand(commandId);
  }, [commandId, runViewportCommand]);

  return null;
}

it("runs registered viewport commands through the scoped boundary", () => {
  const fitView = vi.fn();

  render(
    <ViewportCommandProvider>
      <RegisterCommands commands={{ "fit-view": fitView }} />
      <RunCommand commandId="fit-view" />
    </ViewportCommandProvider>,
  );

  expect(fitView).toHaveBeenCalledTimes(1);
});

it("runs the orient model command through the scoped boundary", () => {
  const orientModel = vi.fn();

  render(
    <ViewportCommandProvider>
      <RegisterCommands commands={{ "orient-model": orientModel }} />
      <RunCommand commandId="orient-model" />
    </ViewportCommandProvider>,
  );

  expect(orientModel).toHaveBeenCalledTimes(1);
});

it("does not run stale commands after registration cleanup", () => {
  const fitView = vi.fn();

  const { rerender } = render(
    <ViewportCommandProvider>
      <RegisterCommands commands={{ "fit-view": fitView }} />
    </ViewportCommandProvider>,
  );

  rerender(
    <ViewportCommandProvider>
      <RunCommand commandId="fit-view" />
    </ViewportCommandProvider>,
  );

  expect(fitView).not.toHaveBeenCalled();
});

