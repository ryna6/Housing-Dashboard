import { useEffect, useState } from "react";
import type { PanelPoint } from "../data/types";
import { loadTabData } from "../data/dataClient";

export function useTabData(tabKey: string) {
  const [data, setData] = useState<PanelPoint[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    loadTabData(tabKey)
      .then((rows) => {
        if (!cancelled) {
          setData(rows);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const msg =
            err instanceof Error ? err.message : "Failed to load data";
          setError(msg);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tabKey]);

  return { data, loading, error };
}
