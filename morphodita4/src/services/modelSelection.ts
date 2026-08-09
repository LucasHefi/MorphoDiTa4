export const selectAvailableModel = (
  models: Readonly<Record<string, unknown>>,
  selectedModel: string | null,
  defaultModel: string | null = null,
): string | null => {
  const modelIds = Object.keys(models);

  if (selectedModel && modelIds.includes(selectedModel)) {
    return selectedModel;
  }

  if (defaultModel && modelIds.includes(defaultModel)) {
    return defaultModel;
  }

  return modelIds.find((modelId) => modelId.toLowerCase().includes('czech'))
    ?? modelIds[0]
    ?? null;
};
