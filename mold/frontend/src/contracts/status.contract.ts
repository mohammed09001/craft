export type StatusTone = "neutral" | "info" | "warning" | "success";

export type StatusItem = {
  id: string;
  label: string;
  value?: string;
  tone: StatusTone;
  accessibleText: string;
};
