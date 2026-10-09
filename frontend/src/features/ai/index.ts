// Öffentliche API des Features „ai" – andere Module importieren nur von hier.
export { default as AiQualityTab } from './components/AiQualityTab';
export { useAiQuality, useTriggerAiQuality, useAiQualityProfiles } from './hooks/useAiQuality';
