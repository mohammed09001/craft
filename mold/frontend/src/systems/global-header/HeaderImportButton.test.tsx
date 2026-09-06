import { useEffect } from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import { AppProviders } from "@/app/providers/AppProviders";
import {
  type PartialViewportCommandHandlers,
  useModelImportStore,
  useViewportCommandRegistration,
} from "@/features/viewport";
import { HeaderImportButton } from "@/systems/global-header/HeaderImportButton";

function RegisterViewportCommands({
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

function renderHeaderImportButton(
  handlers: Partial<{ importStl: () => void; replaceStl: () => void }> = {},
) {
  const commands: PartialViewportCommandHandlers = {
    "import-stl": handlers.importStl,
    "replace-stl": handlers.replaceStl,
  };

  return render(
    <AppProviders>
      <RegisterViewportCommands commands={commands} />
      <HeaderImportButton />
    </AppProviders>,
  );
}

beforeEach(() => {
  useModelImportStore.getState().resetModelImportStatus();
});

it("shows an Import Object tooltip and dispatches import-stl when no model is loaded", () => {
  const importStl = vi.fn();
  renderHeaderImportButton({ importStl });

  const button = screen.getByRole("button", { name: "Import Object" });
  expect(button).toHaveAttribute("title", "Import Object");

  fireEvent.click(button);

  expect(importStl).toHaveBeenCalledTimes(1);
});

it("shows a Replace Object tooltip and dispatches replace-stl once a model is loaded", () => {
  const replaceStl = vi.fn();
  useModelImportStore.getState().setModelImportStatus({
    phase: "ready",
    fileName: "sample.stl",
  });

  renderHeaderImportButton({ replaceStl });

  const button = screen.getByRole("button", { name: "Replace Object" });
  expect(button).toHaveAttribute("title", "Replace Object");
  expect(
    screen.queryByRole("button", { name: "Import Object" }),
  ).not.toBeInTheDocument();

  fireEvent.click(button);

  expect(replaceStl).toHaveBeenCalledTimes(1);
});
