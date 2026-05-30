/**
 * useOrderSocket — real-time order tracking hook
 *
 * Connects to Socket.IO server, joins room "order_{orderId}",
 * and calls onUpdate(data) whenever "order_status_updated" fires.
 *
 * If the socket disconnects, automatically falls back to polling
 * fallbackFetch() every 4 seconds. Resumes socket on reconnect.
 */
import { useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { SOCKET_URL } from "../api";

export function useOrderSocket(orderId, onUpdate, fallbackFetch) {
  const socketRef   = useRef(null);
  const pollRef     = useRef(null);
  const isPolling   = useRef(false);

  const startPolling = () => {
    if (isPolling.current) return;
    isPolling.current = true;
    pollRef.current = setInterval(async () => {
      try {
        const data = await fallbackFetch();
        if (data) onUpdate(data);
      } catch { /* silent */ }
    }, 4000);
  };

  const stopPolling = () => {
    isPolling.current = false;
    clearInterval(pollRef.current);
  };

  useEffect(() => {
    if (!orderId) return;

    // Connect to Socket.IO
    const socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1500,
      reconnectionAttempts: Infinity,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      // Join the order-specific room
      socket.emit("join_order", { order_id: orderId });
      stopPolling();          // stop polling once socket is live
    });

    socket.on("order_status_updated", (data) => {
      if (data.order_id === orderId) {
        onUpdate(data);
      }
    });

    socket.on("disconnect", () => {
      startPolling();         // fall back to polling
    });

    socket.on("connect_error", () => {
      startPolling();         // fall back on connection error too
    });

    return () => {
      if (orderId) socket.emit("leave_order", { order_id: orderId });
      socket.disconnect();
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);
}
