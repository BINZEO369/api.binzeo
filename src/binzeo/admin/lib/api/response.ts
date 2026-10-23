import { NextResponse } from "next/server";
export const ok = <T>(data:T, status=200) => NextResponse.json({ success:true, data }, { status });
export const fail = (message:string, status=400, code?:string) => NextResponse.json({ success:false, error:{ message, code } }, { status });
