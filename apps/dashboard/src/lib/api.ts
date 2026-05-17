import axios from 'axios';
import { auth } from './auth';

export const api = axios.create({ baseURL: '/api/v1' });

// Attach Bearer token to every request
api.interceptors.request.use((config) => {
  const token = auth.getAccess();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing: Promise<void> | null = null;

// Silent refresh on 401, retry once
api.interceptors.response.use(
  (r) => r,
  async (error: unknown) => {
    const err = error as {
      config?: { _retry?: boolean; headers?: Record<string, string>; url?: string };
      response?: { status: number };
    };
    if (err.response?.status !== 401 || err.config?._retry) {
      return Promise.reject(error);
    }
    const refreshToken = auth.getRefresh();
    if (!refreshToken) {
      auth.clear();
      window.location.href = '/login';
      return Promise.reject(error);
    }

    if (!refreshing) {
      refreshing = api
        .post<{ access_token: string; refresh_token: string }>('/auth/refresh', {
          refresh_token: refreshToken,
        })
        .then(({ data }) => {
          auth.setTokens(data.access_token, data.refresh_token);
        })
        .catch(() => {
          auth.clear();
          window.location.href = '/login';
        })
        .finally(() => {
          refreshing = null;
        });
    }

    await refreshing;

    if (!err.config) return Promise.reject(error);
    err.config._retry = true;
    if (err.config.headers) {
      err.config.headers['Authorization'] = `Bearer ${auth.getAccess() ?? ''}`;
    }
    return api(err.config);
  },
);
