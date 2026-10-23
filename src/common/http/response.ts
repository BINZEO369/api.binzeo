import { NextResponse } from "next/server";

export type ApiErrorBody = {
  success: false;
  error: { code: string; message: string; request_id: string };
};

export function apiSuccess<T>(data: T, requestId: string, status = 200) {
  return NextResponse.json(
    { success: true, data, meta: { request_id: requestId, api_version: "v1" } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export function apiError(
  requestId: string,
  code: string,
  message: string,
  status: number,
  headers?: HeadersInit,
) {
  const body: ApiErrorBody = {
    success: false,
    error: { code, message, request_id: requestId },
  };
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...Object.fromEntries(new Headers(headers)) },
  });
}
