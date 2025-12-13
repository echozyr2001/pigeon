export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

export type RequestHeader = {
  key: string;
  value: string;
  enabled?: boolean;
};

export type FfiRequest = {
  method: string;
  url: string;
  headers: RequestHeader[];
  body?: {
    contentType?: string;
    content?: string;
  };
};

export type FfiResponse = {
  status: number;
  statusText: string;
  headers: Array<[string, string]>;
  body: string;
  durationMs: number;
};
