declare module "boring-name-generator" {
  interface NameResult {
    raw: string[];
    dashed: string;
    spaced: string;
  }

  interface GenerateOptions {
    words?: number;
    alliterative?: boolean;
  }

  export function generate(options?: GenerateOptions): NameResult;
}
