import { useState, useEffect, useRef } from "react";
import { trackOrder } from "../api";

/**
 * useOrderPolling
 * ───────────────
 * Polls GET /orders/{id}/track every `intervalMs` milliseconds.
 * Stops automatically when status is Collected or Cancelled.
 *
 * Usage:
 *   const { data, loading } = useOrderPolling(orderId, 10000);
 */
export function useOrderPolling(orderId, intervalMs = 10000) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef(null);

  const fetch = async () => {
    try {
      const res = await trackOrder(orderId);
      setData(res.data);
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!orderId) return;
    fetch();
    intervalRef.current = setInterval(fetch, intervalMs);
    return () => clearInterval(intervalRef.current);
  }, [orderId]);

  // Stop polling on terminal statuses
  useEffect(() => {
    if (data && ["Collected", "Cancelled"].includes(data.status)) {
      clearInterval(intervalRef.current);
    }
  }, [data?.status]);

  return { data, loading };
}
