export const baseApiUrl = (import.meta.env.VITE_BASE_API_URL || "").replace(
  /\/$/,
  "",
);
export const isDev = import.meta.env.DEV;
