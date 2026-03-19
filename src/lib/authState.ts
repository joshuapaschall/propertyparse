export type AuthHeaderState = {
  accessToken: string | null;
  orgId: string | null;
  userId: string | null;
  role: string | null;
};

let authHeaderState: AuthHeaderState = {
  accessToken: null,
  orgId: null,
  userId: null,
  role: null,
};

export const setAuthHeaderState = (next: AuthHeaderState) => {
  authHeaderState = { ...next };
};

export const clearAuthHeaderState = () => {
  authHeaderState = { accessToken: null, orgId: null, userId: null, role: null };
};

export const getAuthHeaderState = () => authHeaderState;

export const mergeAuthHeaderState = (next: Partial<AuthHeaderState>) => {
  authHeaderState = {
    ...authHeaderState,
    ...next,
  };
};
