export type AuthHeaderState = {
  accessToken: string | null;
  orgId: string | null;
  userId: string | null;
};

let authHeaderState: AuthHeaderState = {
  accessToken: null,
  orgId: null,
  userId: null,
};

export const setAuthHeaderState = (next: AuthHeaderState) => {
  authHeaderState = { ...next };
};

export const clearAuthHeaderState = () => {
  authHeaderState = { accessToken: null, orgId: null, userId: null };
};

export const getAuthHeaderState = () => authHeaderState;
