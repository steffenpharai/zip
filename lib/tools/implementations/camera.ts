// Camera state is managed client-side via the HUD store
// This tool just validates the input and returns the state
export async function setCameraEnabled(input: {
  enabled: boolean;
}): Promise<{ enabled: boolean }> {
  // In a real implementation, this might trigger actual camera access
  // For now, it's just a state toggle handled by the UI
  return {
    enabled: input.enabled,
  };
}

