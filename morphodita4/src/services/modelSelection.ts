export const selectAvailableModel = (
  models: Readonly<Record<string, unknown>>,
  selectedModel: string | null,
): string | null => {
  const modelIds = Object.keys(models);

  if (selectedModel && modelIds.includes(selectedModel)) {
    return selectedModel;
  }

  return modelIds.find((modelId) => modelId.toLowerCase().includes('czech'))
    ?? modelIds[0]
    ?? null;
};
