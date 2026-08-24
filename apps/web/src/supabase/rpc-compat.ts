interface SupabaseRpcError {
  readonly message: string;
}

export function isMissingRpcFunction(
  error: SupabaseRpcError | null | undefined,
  functionName: string
): boolean {
  if (!error?.message.includes("Could not find the function")) return false;
  return error.message.includes(functionName);
}
