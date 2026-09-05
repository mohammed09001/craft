export type SprueDesignSource =
  | "equation"
  | "minimum-limit"
  | "maximum-limit";

export interface SprueScalarDesignResult {
  readonly valueMm: number;
  readonly unconstrainedValueMm: number;
  readonly source: SprueDesignSource;
}
