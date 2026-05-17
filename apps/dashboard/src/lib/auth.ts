// In-memory token store. Never touches localStorage (per security spec).
// sessionStorage holds refresh_token only so page refresh doesn't fully log out.

let accessToken: string | null = null;

export const auth = {
  getAccess: () => accessToken,
  getRefresh: () => sessionStorage.getItem('refresh_token'),
  setTokens: (access: string, refresh: string) => {
    accessToken = access;
    sessionStorage.setItem('refresh_token', refresh);
  },
  clear: () => {
    accessToken = null;
    sessionStorage.removeItem('refresh_token');
  },
  isLoggedIn: () => accessToken !== null,
};
