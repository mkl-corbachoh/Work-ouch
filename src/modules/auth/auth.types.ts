export type ExternalIdentity = {
  provider: string;
  subject: string;
  email: string | null;
};

export type CurrentUser = {
  id: number;
  email: string;
  displayName: string;
};

declare global {
  namespace Express {
    interface Request {
      currentUser?: CurrentUser;
      externalIdentity?: ExternalIdentity;
    }
  }
}
