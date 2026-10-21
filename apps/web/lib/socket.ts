"use client";

import { io } from "socket.io-client";
import { getToken } from "./auth";

const getSocketUrl = () => {
  if (process.env.NEXT_PUBLIC_SOCKET_URL && !process.env.NEXT_PUBLIC_SOCKET_URL.includes("localhost")) {
    return process.env.NEXT_PUBLIC_SOCKET_URL;
  }
  if (typeof window !== "undefined") {
    if (window.location.port === "3000") {
      return `${window.location.protocol}//${window.location.hostname}:4000`;
    }
    return window.location.origin;
  }
  return "http://localhost:4000";
};

export const socket = io(getSocketUrl(), {
  autoConnect: false,
  // Evaluated on every (re)connect so a fresh login token is always sent.
  auth: (cb) => cb({ token: getToken() })
});
