import { useState, useEffect } from 'react';
import { initializeWebLLMEngine, setProgressCallback } from "../../lib/llm";

export function useModelLoading() {
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState<string>("");

  useEffect(() => {
    setProgressCallback(setLoadingProgress);
  }, []);

  const handleLoadModel = async () => {
    setIsModelLoading(true);
    try {
      await initializeWebLLMEngine(
        "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC",
        0.7,
        1,
        () => {
          setIsModelLoaded(true);
          setLoadingProgress("Model loaded successfully");
        },
      );
    } catch (err) {
      setLoadingProgress((err as Error).message);
    } finally {
      setIsModelLoading(false);
    }
  };

  return { isModelLoaded, isModelLoading, loadingProgress, handleLoadModel };
}
