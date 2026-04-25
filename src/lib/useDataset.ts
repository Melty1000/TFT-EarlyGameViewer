import { useMemo } from "react";
import { datasetSchema, type Dataset } from "../../shared/tft";
import datasetJson from "../data/tft-set17.json";

type DatasetState =
  | { data: Dataset; isLoading: false; error: null }
  | { data: null; isLoading: false; error: string };

export function useDataset(): DatasetState {
  return useMemo<DatasetState>(() => {
    try {
      const data = datasetSchema.parse(datasetJson);
      return { data, isLoading: false, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown dataset error";
      return { data: null, isLoading: false, error: message };
    }
  }, []);
}
