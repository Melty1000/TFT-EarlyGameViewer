import { useEffect, useState } from "react";
import { datasetSchema, type Dataset } from "../../shared/tft";

const DATASET_URL = `${import.meta.env.BASE_URL}data/tft-set17.json`;

export function useDataset() {
  const [data, setData] = useState<Dataset | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`${DATASET_URL}?t=${Date.now()}`);
        if (!response.ok) {
          throw new Error(`Dataset request failed (${response.status})`);
        }
        const parsed = datasetSchema.parse(await response.json());
        if (active) {
          setData(parsed);
        }
      } catch (err) {
        if (active) {
          const message = err instanceof Error ? err.message : "Unknown dataset error";
          setError(message);
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  return { data, isLoading, error };
}
